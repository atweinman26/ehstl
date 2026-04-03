const admin = require("firebase-admin");

function createFirebaseClient({ serviceAccount, databaseURL }) {
  const appName = `ehstl-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const app = admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
      databaseURL
    },
    appName
  );

  const db = app.database();

  return {
    app,
    db,
    async get(path) {
      const snapshot = await db.ref(path).once("value");
      return snapshot.val();
    },
    async set(path, value) {
      await db.ref(path).set(value);
    },
    async close() {
      await app.delete();
    }
  };
}

module.exports = {
  createFirebaseClient
};

