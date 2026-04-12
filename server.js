// server.js

const admin = require('firebase-admin');
const express = require('express');
const { getMessaging } = require('firebase-admin/messaging');

const app = express();
app.use(express.json());

// ---------------------
// FIREBASE INIT
// ---------------------
const serviceAccount = require('./innnra-c6579-firebase-adminsdk-fbsvc-a79c406aa2.json');

console.log("Project ID:", serviceAccount.project_id);
console.log("Client Email:", serviceAccount.client_email);
console.log("Private Key ID:", serviceAccount.private_key_id);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
console.log('✅ Firebase Admin SDK initialized');


// ---------------------
// REGISTER TOKEN API
// ---------------------
app.post('/register-token', async (req, res) => {

  try {

    const { userId, token, role } = req.body;

    if (!userId || !token || !role) {
      return res.status(400).json({ error: 'Missing userId, token or role' });
    }

    await db.collection('fcmTokens').doc(userId).set(
      {
        token: token,
        role: role,
        updated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log("Token saved:", userId);

    res.json({ success: true });

  } catch (error) {

    console.error('❌ register-token error:', error.message);
    res.status(500).json({ error: error.message });

  }

});


// ---------------------
// SEND RIDE TO DRIVERS (FIXED)
// ---------------------
app.post('/send-to-drivers', async (req, res) => {

  try {

    const { title, body, data } = req.body;

    console.log("Ride request received");

    const snapshot = await db
      .collection('drivers')
      .where('role', '==', 'driver')
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'No drivers found' });
    }

    const tokens = [];

    snapshot.forEach(doc => {
      const docData = doc.data();

      if (docData.fcmToken) {
        tokens.push(docData.fcmToken);
      }
    });

    if (tokens.length === 0) {
      return res.status(404).json({ error: 'No driver tokens found' });
    }

    console.log("Driver tokens:", tokens.length);

    // ✅ IMPORTANT FIX: DATA ONLY (NO notification block)
    const message = {
      tokens: tokens,
      data: {
        title: String(title || "New Ride Request"),
        body: String(body || "A passenger requested a ride"),
        ...(data
          ? Object.keys(data).reduce((acc, key) => {
              acc[key] = String(data[key]);
              return acc;
            }, {})
          : {})
      },
      android: {
        priority: "high",
      }
    };

    const response = await getMessaging().sendEachForMulticast(message);

    console.log("Notifications sent:", response.successCount);

    if (response.failureCount > 0) {

      const failedTokens = [];

      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });

      console.log("Failed tokens:", failedTokens);
    }

    res.json({
      success: true,
      sent: response.successCount
    });

  } catch (error) {

    console.error('❌ send-to-drivers FULL ERROR:', error);
    res.status(500).json({ error: error.message });

  }

});


// ---------------------
// HEALTH CHECK
// ---------------------
app.get('/', (req, res) => {
  res.send("Ride Notification Server Running");
});


// ---------------------
// START SERVER
// ---------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});