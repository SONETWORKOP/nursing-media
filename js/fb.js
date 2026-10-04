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

  // Fail fast: Firestore request atak jaye to latkao mat (caller fallback use karega)
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error((label || "Request") + " timed out — check internet")), ms))
    ]);
  }
  const DB_TIMEOUT = 12000;

  /* ---------- data (site ke purane JSON shapes) ---------- */
  async function loadSite() {
    const doc = await withTimeout(
      db.collection("site").doc("config").get(), DB_TIMEOUT, "Site data");
    const s = doc.exists ? doc.data() : {};
    return {
      course: s.course || "BSc Nursing",
      tagline: s.tagline || "",
      owner: { name: s.owner_name || "", phone: s.owner_phone || "", role: "Site Owner" },
      theme: "editorial",
      semesters: [1, 2, 3, 4, 5, 6, 7]
    };
  }

  async function loadSem(sem) {
    const snap = await withTimeout(
      db.collection("sems").doc(String(sem)).collection("subjects").orderBy("order").get(),
      DB_TIMEOUT, "Semester " + sem + " data");
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

  /* ---------- sync subject NAMES from data/*.json (topics untouched) ----------
     Renames/adds subjects, deletes stale ones. Topic content is NEVER touched. */
  async function syncSubjectsFromJson(status) {
    const say = status || (() => {});
    const site = await (await fetch("data/site.json")).json();
    let added = 0, renamed = 0, removed = 0;
    for (const sem of site.semesters) {
      say(`Semester ${sem} sync…`);
      const d = await (await fetch(`data/sem${sem}.json`)).json();
      const col = db.collection("sems").doc(String(sem)).collection("subjects");
      const existing = await col.get();
      const wantIds = new Set(d.subjects.map((s) => s.id));
      for (const docSnap of existing.docs) {
        if (!wantIds.has(docSnap.id)) { await col.doc(docSnap.id).delete(); removed++; }
      }
      let order = 0;
      for (const s of d.subjects) {
        const ref = col.doc(s.id);
        const doc = await ref.get();
        if (!doc.exists) {
          await ref.set({
            name: s.name, icon: s.icon || "", order: order++,
            topics: s.topics.map((t) => ({
              id: t.id, title: t.title, content: t.content || "",
              pdf: t.pdf || "", video: t.video || ""
            }))
          });
          added++;
        } else {
          const cur = doc.data() || {};
          const patch = {};
          if (cur.name !== s.name) patch.name = s.name;
          if ((cur.icon || "") !== (s.icon || "")) patch.icon = s.icon || "";
          if (cur.order !== order) patch.order = order;
          if (Object.keys(patch).length) { await ref.update(patch); renamed++; }
          order++;
          if (!Array.isArray(cur.topics) || !cur.topics.length) {
            await ref.update({ topics: s.topics.map((t) => ({
              id: t.id, title: t.title, content: t.content || "",
              pdf: t.pdf || "", video: t.video || ""
            })) });
          }
        }
      }
    }
    say(`Done ✓ — ${added} new, ${renamed} renamed, ${removed} removed (notes safe)`);
  }
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

  /* ---------- Paid section (ID/password, admin-created, Firestore) ----------
     paid_codes/{ID}: { name, passHash (SHA-256 of ID::password), active, createdAt }
     paid_notes/{autoId}: { title, content, pdf, video, order, createdAt }
     Login = single GET by ID (rules allow get), hash compare client-side.
     NOTE: static site par gate client-side hai — IDs guess-proof rakho. */
  const paidId = (raw) => String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);

  async function sha256Hex(s) {
    const bytes = new TextEncoder().encode(s);
    if (crypto.subtle?.digest) {
      const buf = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // fallback (non-secure, purane browser): simple hash
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  }

  const paidHash = (id, password) => sha256Hex(id + "::" + password);

  function randomPaidId() {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return "NM-" + s;
  }

  function randomPaidPassword(len = 8) {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < (len || 8); i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  async function paidLogin(loginId, password) {
    const id = paidId(loginId);
    if (!id || !password) throw new Error("ID aur password likho");
    const doc = await withTimeout(
      db.collection("paid_codes").doc(id).get(), DB_TIMEOUT, "Paid login");
    if (!doc.exists) throw new Error("ID ya password galat hai");
    const d = doc.data() || {};
    if (d.active === false) throw new Error("Ye ID revoke hai — admin se sampark karo");
    const h = await paidHash(id, password);
    if (h !== d.passHash) throw new Error("ID ya password galat hai");
    const sess = { id, name: d.name || "", at: new Date().toISOString() };
    try { sessionStorage.setItem("paid_session", JSON.stringify(sess)); } catch (_) {}
    return sess;
  }

  function paidSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem("paid_session") || "null");
      return s && s.id ? s : null;
    } catch (_) { return null; }
  }

  function paidLogout() {
    try { sessionStorage.removeItem("paid_session"); } catch (_) {}
  }

  // Revoke check: apni ID ab bhi active hai? Nahi to session udao.
  async function paidRefresh() {
    const s = paidSession();
    if (!s) return null;
    const doc = await withTimeout(
      db.collection("paid_codes").doc(s.id).get(), DB_TIMEOUT, "Paid check");
    if (!doc.exists || (doc.data() || {}).active === false) {
      paidLogout();
      throw new Error("Ye ID revoke hai — admin se sampark karo");
    }
    const sess = { id: s.id, name: (doc.data() || {}).name || "", at: s.at };
    try { sessionStorage.setItem("paid_session", JSON.stringify(sess)); } catch (_) {}
    return sess;
  }

  async function listPaidCodes() {
    const snap = await withTimeout(
      db.collection("paid_codes").orderBy("createdAt", "desc").limit(500).get(),
      DB_TIMEOUT, "Paid users");
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function createPaidCode({ loginId, name, password }) {
    const id = paidId(loginId) || randomPaidId();
    const pass = password || randomPaidPassword();
    if (pass.length < 4) throw new Error("Password 4+ akshar");
    const exists = await db.collection("paid_codes").doc(id).get();
    if (exists.exists) throw new Error("Ye ID pehle se hai");
    await db.collection("paid_codes").doc(id).set({
      name: String(name || ""), passHash: await paidHash(id, pass),
      active: true, createdAt: new Date().toISOString(),
    });
    return { id, password: pass };
  }

  async function setPaidCodeActive(id, active) {
    await db.collection("paid_codes").doc(paidId(id)).update({ active: !!active });
  }

  async function resetPaidCodePassword(id, newPassword) {
    if (!newPassword || newPassword.length < 4) throw new Error("Password 4+ akshar");
    const pid = paidId(id);
    await db.collection("paid_codes").doc(pid).update({
      passHash: await paidHash(pid, newPassword),
    });
    return newPassword;
  }

  async function deletePaidCode(id) {
    await db.collection("paid_codes").doc(paidId(id)).delete();
  }

  async function listPaidNotes() {
    const snap = await withTimeout(
      db.collection("paid_notes").orderBy("order").get(), DB_TIMEOUT, "Paid notes");
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function savePaidNote(note) {
    const col = db.collection("paid_notes");
    if (note.id) {
      await col.doc(note.id).update({
        title: note.title || "", content: note.content || "",
        pdf: note.pdf || "", video: note.video || "",
      });
      return note.id;
    }
    const ref = await col.add({
      title: note.title || "", content: note.content || "",
      pdf: note.pdf || "", video: note.video || "",
      order: Date.now(), createdAt: new Date().toISOString(),
    });
    return ref.id;
  }

  async function deletePaidNote(id) {
    await db.collection("paid_notes").doc(id).delete();
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
    listLeads, addLead, seedFromJson, syncSubjectsFromJson,
    paidId, paidLogin, paidSession, paidLogout, paidRefresh,
    listPaidCodes, createPaidCode, setPaidCodeActive, resetPaidCodePassword, deletePaidCode,
    listPaidNotes, savePaidNote, deletePaidNote,
  };
})();
