const admin = require('firebase-admin');
const express = require('express');

const app = express();

app.use(express.json());

// =========================
// FIREBASE INIT
// =========================

console.log(
  'ENV EXISTS:',
  !!process.env.FIREBASE_SERVICE_ACCOUNT,
);

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT missing');
  process.exit(1);
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT,
  );
} catch (error) {
  console.error('❌ INVALID FIREBASE JSON:', error.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

console.log('✅ Firebase Connected');

// =========================
// HEALTH CHECK
// =========================

app.get('/', (req, res) => {
  res.send('🚖 Ride Notification Server Running');
});

// =========================
// REGISTER TOKEN
// =========================

app.post('/register-token', async (req, res) => {
  try {
    const { userId, token, role } = req.body;

    if (!userId || !token || !role) {
      return res.status(400).json({
        error: 'Missing fields',
      });
    }

    await db
      .collection('drivers')
      .doc(userId)
      .set(
        {
          role,
          fcmToken: token,
          isOnline: true,
          location: {
            lat: 31.5204,
            lng: 74.3587,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    console.log('✅ TOKEN SAVED:', userId);

    res.json({ success: true });
  } catch (error) {
    console.log('REGISTER ERROR:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

// =========================
// SEND TO DRIVERS
// =========================

app.post('/send-to-drivers', async (req, res) => {
  try {
    const {
      title,
      body,
      from,
      destination,
      fare,
      item,
      quantity,
    } = req.body;

    console.log('📨 REQUEST RECEIVED');

    // =========================
    // GET ONLINE DRIVERS
    // =========================

    const snapshot = await db
      .collection('drivers')
      .where('role', '==', 'driver')
      .where('isOnline', '==', true)
      .get();

    if (snapshot.empty) {
      console.log('❌ NO ONLINE DRIVERS');

      return res.status(404).json({
        error: 'No online drivers found',
      });
    }

    const tokens = [];
    const drivers = [];

    snapshot.forEach(doc => {
      const driver = doc.data();

      console.log('DRIVER:', doc.id);

      if (driver.fcmToken) {
        tokens.push(driver.fcmToken);

        drivers.push({
          id: doc.id,
          ...driver,
        });
      }
    });

    console.log('TOKENS:', tokens.length);

    if (tokens.length === 0) {
      return res.status(404).json({
        error: 'No FCM tokens found',
      });
    }

    // =========================
    // FCM MESSAGE
    // =========================

    const message = {
      tokens,

      notification: {
        title: title || 'New Ride Request 🚖',
        body: body || 'Passenger requested ride',
      },

      data: {
        senderId: String(from || ''),   // ✅ FIXED (was "from")
        destination: String(destination || ''),
        fare: String(fare || ''),
        item: String(item || ''),
        quantity: String(quantity || ''),
      },

      android: {
        priority: 'high',
      },
    };

    // =========================
    // SEND FCM
    // =========================

    const response = await admin
      .messaging()
      .sendEachForMulticast(message);

    console.log('✅ SUCCESS:', response.successCount);
    console.log('❌ FAILED:', response.failureCount);

    // =========================
    // SHOW FAILED TOKENS
    // =========================

    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        console.log('FAILED TOKEN:', tokens[idx]);
        console.log('ERROR:', resp.error);
      }
    });

    // =========================
    // SAVE NOTIFICATIONS
    // =========================

for (const driver of drivers) {

  await db
    .collection('notifications')
    .doc(driver.id)
    .collection('items')
    .add({
      title:
        title ||
        'New Ride Request 🚖',

      body:
        body ||
        'Passenger requested ride',

      from,

      destination,

      fare,

      item,

      quantity,

      type,

      senderRole:
        'passenger',

      targetRole:
        'driver',

      read: false,

      createdAt:
        admin.firestore.FieldValue.serverTimestamp(),
    });
}
    // =========================
    // RESPONSE
    // =========================

    res.json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
    });
  } catch (error) {
    console.log('❌ SERVER ERROR:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

// =========================
// START SERVER
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SERVER RUNNING ON ${PORT}`);
});
