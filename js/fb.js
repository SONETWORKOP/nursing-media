/* ============================================================
   EDU-NOTES • fb.js — Firebase layer (Auth OTP + Firestore + Storage)
   Config missing ho to site purane static JSON mode me chalti hai.
   NOTE: firebase compat SDKs ko is file SE PEHLE load karo:
     firebase-app-compat.js, firebase-auth-compat.js,
     firebase-firestore-compat.js, firebase-storage-compat.js
   ============================================================ */
"use strict";

window.FB = (() => {
  let app = null, auth = null, db = null, storage = null;
  let ready = false;
  let confirmation = null; // phone OTP
  let recaptcha = null;

  const hasConfig = () =>
    window.FIREBASE_CONFIG &&
    window.FIREBASE_CONFIG.apiKey &&
    !String(window.FIREBASE_CONFIG.apiKey).startsWith("PASTE");

  function init() {
    if (ready) return true;
    if (!hasConfig() || typeof firebase === "undefined") return false;
    try {
      app = firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      storage = firebase.storage();
      ready = true;
    } catch (e) {
      console.warn("Firebase init fail:", e);
      ready = false;
    }
    return ready;
  }

  const isReady = () => ready;
  const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);

  /* ---------- data (site ke purane JSON shapes) ---------- */
  async function loadSite() {
    const doc = await db.collection("site").doc("config").get();
    const s = doc.exists ? doc.data() : {};
    return {
      course: s.course || "BSc Nursing",
      tagline: s.tagline || "",
      owner: { name: s.owner_name || "", phone: s.owner_phone || "", role: "Site Owner" },
      theme: "editorial",
      semesters: [1, 2, 3, 4, 5, 6]
    };
  }

  async function loadSem(sem) {
    const snap = await db.collection("sems").doc(String(sem))
      .collection("subjects").orderBy("order").get();
    const subjects = snap.docs.map((d) => {
      const s = d.data();
      return {
        id: d.id, name: s.name, icon: s.icon || "",
        topics: (s.topics || []).map((t) => ({
          id: t.id, title: t.title, content: t.content || "",
          pdf: t.pdf || "", video: t.video || ""
        }))
      };
    });
    return { sem: Number(sem), title: "Semester " + sem, subjects };
  }

  /* ---------- auth: Google (free) + Email (free) ---------- */
  async function googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred = await auth.signInWithPopup(provider);
    return cred.user;
  }

  async function emailRegister(email, password) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    return cred.user;
  }

  async function emailLogin(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  }

  // Password reset EMAIL — 100% free (SMS nahi, isliye koi charge nahi).
  // NOTE: ye reset LINK bhejta hai, numeric code nahi.
  async function resetPassword(email) {
    await auth.sendPasswordResetEmail(email);
  }

  // Email verification — register ke baad inbox me link jata hai. Bhi 100% free.
  async function sendVerification() {
    const u = auth.currentUser;
    if (!u) throw new Error("Login first");
    await u.sendEmailVerification();
  }

  // Server se fresh user data lao (verify link click ke baad status update ke liye)
  async function refreshUser() {
    const u = auth.currentUser;
    if (u) { try { await u.reload(); } catch (_) {} }
    return auth.currentUser;
  }

  /* ---------- auth: phone OTP (sirf Blaze plan par — optional) ---------- */
  function ensureRecaptcha(btnId) {
    if (recaptcha) { try { recaptcha.clear(); } catch (_) {} recaptcha = null; }
    recaptcha = new firebase.auth.RecaptchaVerifier(btnId, { size: "invisible" });
    return recaptcha.render().then(() => recaptcha);
  }

  async function sendOtp(phone10, btnId) {
    const phone = "+91" + digits(phone10);
    if (!/^[6-9]\d{9}$/.test(digits(phone10))) throw new Error("Enter a valid 10-digit number");
    const verifier = await ensureRecaptcha(btnId);
    confirmation = await auth.signInWithPhoneNumber(phone, verifier);
    return true;
  }

  async function verifyOtp(code) {
    if (!confirmation) throw new Error("Send the OTP first");
    const cred = await confirmation.confirm(String(code).trim());
    return cred.user;
  }

  function onUser(cb) { auth.onAuthStateChanged(cb); }
  async function logout() { await auth.signOut(); }

  function userLabel(user) {
    if (!user) return "";
    return user.displayName || user.email || user.phoneNumber || "Student";
  }

  // Admin = owner email ya owner phone se login
  function isAdmin(user) {
    if (!user) return false;
    const ownerEmail = String(window.OWNER_EMAIL || "").toLowerCase();
    if (ownerEmail && String(user.email || "").toLowerCase() === ownerEmail) return true;
    return isAdminPhone(user);
  }

  function isAdminPhone(user) {
    if (!user || !user.phoneNumber) return false;
    const owner = digits(window.OWNER_PHONE || "");
    return digits(user.phoneNumber) === owner && owner.length === 10;
  }

  /* ---------- registered users (login par profile save, admin list dekhe) ---------- */
  async function saveUserProfile() {
    const u = auth.currentUser;
    if (!u) return;
    const ref = db.collection("users").doc(u.uid);
    let firstSeen = null;
    try { const old = await ref.get(); if (old.exists) firstSeen = old.data().at || null; } catch (_) {}
    await ref.set({
      name: u.displayName || "",
      email: u.email || "",
      phone: u.phoneNumber || "",
      provider: (u.providerData[0] || {}).providerId || "unknown",
      verified: !!u.emailVerified,
      at: firstSeen || new Date().toISOString(),
      lastLogin: new Date().toISOString()
    }, { merge: true });
  }

  async function listUsers(limit = 200) {
    const snap = await db.collection("users").orderBy("at", "desc").limit(limit).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async function saveTopic(sem, sub, topic) {
    const ref = db.collection("sems").doc(String(sem)).collection("subjects").doc(sub);
    const doc = await ref.get();
    const topics = (doc.data() || {}).topics || [];
    const i = topics.findIndex((t) => t.id === topic.id);
    if (i >= 0) topics[i] = topic; else topics.push(topic);
    topics.sort((a, b) => a.id - b.id);
    await ref.update({ topics });
  }

  async function saveSubject(sem, subId, name, icon) {
    const ref = db.collection("sems").doc(String(sem)).collection("subjects").doc(subId);
    const doc = await ref.get();
    if (doc.exists) await ref.update({ name, icon });
    else await ref.set({ name, icon, order: Date.now(), topics: [] });
  }

  async function saveSettings(s) { await db.collection("site").doc("config").set(s, { merge: true }); }
  async function getSettings() {
    const doc = await db.collection("site").doc("config").get();
    return doc.exists ? doc.data() : {};
  }

  async function listLeads(limit = 100) {
    const snap = await db.collection("leads").orderBy("at", "desc").limit(limit).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function addLead(lead) {
    await db.collection("leads").add({ ...lead, at: new Date().toISOString() });
  }

  /* ---------- one-time seed: data/*.json → Firestore ----------
     SAFE: jo subject pehle se hai use CHOD deta hai (overwrite nahi).
     Sirf missing data bharta hai — dobara dabana safe hai. */
  async function seedFromJson(status) {
    const say = status || (() => {});
    const site = await (await fetch("data/site.json")).json();
    await db.collection("site").doc("config").set({
      course: site.course, tagline: site.tagline,
      owner_name: site.owner.name, owner_phone: site.owner.phone
    }, { merge: true });
    let added = 0, skipped = 0;
    for (const sem of site.semesters) {
      say(`Semester ${sem} check…`);
      const d = await (await fetch(`data/sem${sem}.json`)).json();
      let order = 0;
      for (const s of d.subjects) {
        const ref = db.collection("sems").doc(String(sem)).collection("subjects").doc(s.id);
        const exists = (await ref.get()).exists;
        if (exists) { skipped++; continue; } // tumhara likha notes SAFE
        await ref.set({
          name: s.name, icon: s.icon || "", order: order++,
          topics: s.topics.map((t) => ({
            id: t.id, title: t.title, content: t.content || "",
            pdf: t.pdf || "", video: t.video || ""
          }))
        });
        added++;
      }
    }
    say(`Done ✓ — ${added} naye, ${skipped} pehle se the (untouched)`);
  }

  // turant init (taaki neeche wali scripts ko ready mile) + backup
  init();
  document.addEventListener("DOMContentLoaded", init);

  return {
    init, isReady, loadSite, loadSem,
    sendOtp, verifyOtp, googleLogin, emailRegister, emailLogin, resetPassword,
    sendVerification, refreshUser,
    onUser, logout, userLabel, isAdmin, isAdminPhone,
    saveUserProfile, listUsers,
    saveTopic, saveSubject, saveSettings, getSettings,
    listLeads, addLead, seedFromJson
  };
})();
