const admin = require("firebase-admin");
const express = require("express");

const app = express();
app.use(express.json());


// ---------------------
// FIREBASE INIT (FIXED + SAFE)
// ---------------------
console.log("ENV CHECK:", !!process.env.FIREBASE_SERVICE_ACCOUNT);

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT is missing in Render");
  process.exit(1);
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
  console.error("❌ Firebase ENV JSON is invalid:", error.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

console.log("✅ Firebase Connected");


// ---------------------
// REGISTER TOKEN API
// ---------------------
app.post("/register-token", async (req, res) => {
  try {
    const { userId, token, role } = req.body;

    if (!userId || !token || !role) {
      return res.status(400).json({ error: "Missing userId, token or role" });
    }

    await db.collection("fcmTokens").doc(userId).set(
      {
        token,
        role,
        updated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log("✅ Token saved:", userId);

    res.json({ success: true });

  } catch (error) {
    console.error("❌ register-token error:", error);
    res.status(500).json({ error: error.message });
  }
});


// ---------------------
// SEND TO DRIVERS (FCM)
// ---------------------
app.post("/send-to-drivers", async (req, res) => {
  try {
    const { title, body, data } = req.body;

    const snapshot = await db
      .collection("drivers")
      .where("role", "==", "driver")
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "No drivers found" });
    }

    const tokens = [];

    snapshot.forEach((doc) => {
      const d = doc.data();
      if (d.fcmToken) {
        tokens.push(d.fcmToken);
      }
    });

    if (tokens.length === 0) {
      return res.status(404).json({ error: "No FCM tokens found" });
    }

    const message = {
      tokens,
      data: {
        title: String(title || "New Ride Request 🚖"),
        body: String(body || "A passenger requested a ride"),
        ...(data || {}),
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log("📨 Sent:", response.successCount);

    res.json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
    });

  } catch (error) {
    console.error("❌ send-to-drivers error:", error);
    res.status(500).json({ error: error.message });
  }
});


// ---------------------
// HEALTH CHECK
// ---------------------
app.get("/", (req, res) => {
  res.send("🚖 Ride Notification Server Running");
});


// ---------------------
// START SERVER
// ---------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
