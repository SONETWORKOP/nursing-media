/* ============================================================
   EDU-NOTES • app.js — data loading, routing helpers,
   theme toggle, owner info, live search
   ============================================================ */
"use strict";

async function loadJSON(path) {
  // Firebase laga hai to cloud se, warna purani static JSON se
  try {
    if (window.FB && FB.isReady()) {
      if (path === "data/site.json") return await FB.loadSite();
      const m = path.match(/data\/sem(\d+)\.json/);
      if (m) return await FB.loadSem(m[1]);
    }
  } catch (e) {
    console.warn("Firestore fail, JSON fallback:", e);
  }
  const res = await fetch(path);
  if (!res.ok) throw new Error("Cannot load " + path);
  return res.json();
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ---------- Theme removed: site ab sirf light (clean) mode me hai ---------- */

/* ---------- Owner info from data/site.json ---------- */
async function renderOwner() {
  try {
    const site = await loadJSON("data/site.json");
    document.querySelectorAll("[data-owner-name]").forEach((el) => {
      el.textContent = site.owner.name;
    });
    document.querySelectorAll("[data-owner-phone]").forEach((el) => {
      el.textContent = site.owner.phone;
    });
    document.querySelectorAll("[data-call-link]").forEach((el) => {
      el.href = "tel:" + site.owner.phone.replace(/\s+/g, "");
    });
    document.querySelectorAll("[data-course]").forEach((el) => {
      el.textContent = site.course;
    });
  } catch (e) {
    console.warn("site.json not loaded:", e);
  }
}

/* ---------- Live search across all semesters ---------- */
async function initSearch() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResults");
  if (!input || !box) return;

  let cache = null;
  async function allData() {
    if (cache) return cache;
    cache = [];
    for (let sem = 1; sem <= 6; sem++) {
      try {
        const d = await loadJSON(`data/sem${sem}.json`);
        for (const sub of d.subjects) {
          for (const t of sub.topics) {
            cache.push({ sem, subId: sub.id, subName: sub.name, id: t.id, title: t.title });
          }
        }
      } catch (e) { /* skip missing file */ }
    }
    return cache;
  }

  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { box.innerHTML = ""; return; }
      const data = await allData();
      const hits = data.filter((r) =>
        r.title.toLowerCase().includes(q) || r.subName.toLowerCase().includes(q)
      ).slice(0, 10);
      box.innerHTML = hits.length
        ? hits.map((r) =>
            `<a class="result-item" href="topic.html?sem=${r.sem}&sub=${esc(r.subId)}&t=${r.id}">` +
            `<b>${esc(r.title)}</b> <small>• ${esc(r.subName)} • Sem ${r.sem}</small></a>`
          ).join("")
        : `<div class="result-item">No results found ❌</div>`;
    }, 250);
  });
}

/* ---------- Navbar auth state (Firebase OTP user / Flask user / guest) ---------- */
function paintAuthBox(user) {
  const nav = document.querySelector(".mast .wrap .nav, .navbar .wrap .nav-links, .nav");
  if (!nav) return;
  const old = document.getElementById("authBox");
  if (old) old.remove();
  const box = document.createElement("span");
  box.id = "authBox";
  box.style.cssText = "display:inline-flex;gap:8px;align-items:center;margin-left:8px;";
  if (user) {
    const label = esc(user.label || "Student");
    box.innerHTML =
      `<span style="font-size:13.5px;font-weight:700">👋 ${label}</span>` +
      (user.is_admin ? `<a class="btn btn-sm" href="admin.html">Admin Panel</a>` : ``) +
      `<button class="btn btn-sm" id="logoutBtn" type="button">Logout</button>`;
    nav.appendChild(box);
    document.getElementById("logoutBtn").addEventListener("click", async () => {
      try {
        if (user.fb) await FB.logout();
        else await fetch("api/logout", { method: "POST" });
      } catch (_) {}
      window.location.reload();
    });
  } else {
    box.innerHTML = `<a class="btn btn-sm" href="login.html">Login</a>`;
    nav.appendChild(box);
  }
}

async function renderAuth() {
  if (window.FB && FB.isReady()) {
    FB.onUser((u) => {
      if (!u) return paintAuthBox(null);
      paintAuthBox({ label: FB.userLabel(u), is_admin: FB.isAdmin(u), fb: true });
    });
    return;
  }
  let user = null;
  try {
    const r = await fetch("api/me");
    user = (await r.json()).user;
  } catch (e) { /* backend na ho to guest */ }
  if (!user) return paintAuthBox(null);
  paintAuthBox({ label: String(user.name).split(" ")[0], is_admin: user.is_admin });
}

document.addEventListener("DOMContentLoaded", () => {
  renderOwner();
  renderAuth();
  initSearch();
  if (window.EduTilt) window.EduTilt.bind();
  if (window.EduBg) window.EduBg.start();
});
