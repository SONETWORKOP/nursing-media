/* ============================================================
   STEP 1 — Firebase config yahan paste karo (2 min ka kaam)
   1. https://console.firebase.google.com → New project (nursing-media)
   2. Build → Authentication → Sign-in method → Phone → Enable
   3. Build → Firestore Database → Create database (production mode)
   4. Build → Storage → Get started
   5. Project Settings (⚙️) → General → "Your apps" → Web app (</>)
      → jo firebaseConfig mile, neeche paste kar do. Bas!
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBZVvq-kUah1RrNLb3cZu1QEFw7Kw2400I",
  authDomain: "media-e6307.firebaseapp.com",
  projectId: "media-e6307",
  storageBucket: "media-e6307.firebasestorage.app",
  messagingSenderId: "200566905957",
  appId: "1:200566905957:web:f83ec201d0e96356603a8c"
};

/* Owner ka EMAIL — is Gmail se Google login karne wala ADMIN banega */
window.OWNER_EMAIL = "ojhashivam81@gmail.com";

/* Owner ka number (admin pehchan ke liye backup) */
window.OWNER_PHONE = "9928096797";
