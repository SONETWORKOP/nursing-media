/* ============================================================
   EDU-NOTES • home.js — animated counters, FAQ accordion,
   free-demo lead form, study library, one-page explorer
   (static site: leads browser ke localStorage me save hote hain)
   ============================================================ */
"use strict";

window.EduHome = (() => {
  /* ---------- Animated counters ---------- */
  function counters() {
    const els = document.querySelectorAll("[data-count]");
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const target = parseInt(e.target.dataset.count, 10) || 0;
        const dur = 1400, t0 = performance.now();
        (function tick(t) {
          const p = Math.min((t - t0) / dur, 1);
          e.target.textContent = Math.floor(target * (1 - Math.pow(1 - p, 3))).toLocaleString("en-IN");
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      }
    }, { threshold: 0.4 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- FAQ accordion ---------- */
  function faq() {
    document.querySelectorAll(".faq-item").forEach((item) => {
      const q = item.querySelector(".faq-q");
      if (!q) return;
      q.addEventListener("click", () => {
        const open = item.classList.contains("open");
        document.querySelectorAll(".faq-item.open").forEach((o) => o.classList.remove("open"));
        if (!open) item.classList.add("open");
      });
    });
  }

  /* ---------- Free demo lead form (3 steps) ---------- */
  function goStep(n) {
    document.querySelectorAll("#demoForm .lstep").forEach((s) => {
      s.hidden = s.dataset.step !== String(n);
    });
    document.querySelectorAll("#leadDots span").forEach((d, i) => {
      d.classList.toggle("on", i < n);
    });
  }

  function leadForm() {
    const form = document.getElementById("demoForm");
    if (!form) return;
    let slot = "Morning (9–12)";

    document.querySelectorAll("#slotChips .slot").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#slotChips .slot").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        slot = b.dataset.slot;
      });
    });
    document.querySelectorAll("#demoForm [data-back]").forEach((b) => {
      b.addEventListener("click", () => goStep(+b.dataset.back));
    });

    const to2 = document.getElementById("toStep2");
    if (to2) to2.addEventListener("click", () => {
      const name = form.querySelector("#leadName").value.trim();
      const phone = form.querySelector("#leadPhone").value.replace(/\D/g, "").slice(-10);
      const err = document.getElementById("leadErr");
      if (name.length < 2) { err.textContent = "Please enter your name first"; return; }
      if (!/^[6-9]\d{9}$/.test(phone)) { err.textContent = "Enter a valid 10-digit mobile number"; return; }
      err.textContent = "";
      goStep(2);
    });
    const to3 = document.getElementById("toStep3");
    if (to3) to3.addEventListener("click", () => goStep(3));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = form.querySelector("#leadName").value.trim();
      const phone = form.querySelector("#leadPhone").value.replace(/\D/g, "").slice(-10);
      const sem = form.querySelector("#leadSem").value;
      const lead = { name, phone, sem, slot, at: new Date().toISOString() };
      try {
        const leads = JSON.parse(localStorage.getItem("edu-leads") || "[]");
        leads.push(lead);
        localStorage.setItem("edu-leads", JSON.stringify(leads));
      } catch (_) { /* storage unavailable */ }
      try {
        if (window.FB && FB.isReady()) await FB.addLead({ name, phone, sem, slot });
      } catch (_) { /* offline — localStorage me safe hai */ }
      document.getElementById("leadBox").innerHTML = `
        <div class="form-success">
          <h4>Booked, ${name.split(" ")[0]}!</h4>
          <p>For your free Sem ${sem} demo, you’ll get a call <b>${slot}</b> on <b>${phone}</b>.<br />
          Can’t wait? Talk directly:<br />
          <a data-call-link href="tel:"><span data-owner-phone></span></a></p>
        </div>`;
      if (window.renderOwnerInline) window.renderOwnerInline(document.getElementById("leadBox"));
    });
  }

  /* ---------- Study library: har sem ke subjects ke asli links ---------- */
  async function buildLibrary() {
    const grid = document.getElementById("libGrid");
    if (!grid) return;
    let html = "";
    for (let sem = 1; sem <= 6; sem++) {
      try {
        const d = await loadJSON(`data/sem${sem}.json`);
        const links = d.subjects.map((s) =>
          `<li><a href="subject.html?sem=${sem}&sub=${encodeURIComponent(s.id)}">${escHtml(s.name)}</a></li>`
        ).join("");
        const locked = Math.max(0, 5 - d.subjects.length);
        let lockLis = "";
        for (let k = 0; k < locked; k++) lockLis += `<li class="locked">🔒 Coming soon</li>`;
        html += `<div class="libcol"><h4>Semester ${sem}</h4><ul>${links}${lockLis}</ul>
          <a class="liball" href="semester.html?sem=${sem}">Open Sem ${sem} →</a></div>`;
      } catch (_) { /* skip */ }
    }
    grid.innerHTML = html;
  }

  // owner info success-box ke andar bharne ke liye helper
  window.renderOwnerInline = async (root) => {
    try {
      const res = await fetch("data/site.json");
      const site = await res.json();
      root.querySelectorAll("[data-owner-phone]").forEach((el) => { el.textContent = site.owner.phone; });
      root.querySelectorAll("[data-call-link]").forEach((el) => { el.href = "tel:" + site.owner.phone.replace(/\s+/g, ""); });
    } catch (_) { /* ignore */ }
  };

  /* ---------- One-page explorer: sem tabs + subject accordion + topic chips ---------- */
  const MOTIF_PHOTOS = [
    "https://images.pexels.com/photos/32254525/pexels-photo-32254525.jpeg?auto=compress&cs=tinysrgb&w=400",
    "https://images.pexels.com/photos/19438560/pexels-photo-19438560.jpeg?auto=compress&cs=tinysrgb&w=400",
    "https://images.pexels.com/photos/32115898/pexels-photo-32115898.jpeg?auto=compress&cs=tinysrgb&w=400",
    "https://images.pexels.com/photos/32254523/pexels-photo-32254523.jpeg?auto=compress&cs=tinysrgb&w=400",
    "https://images.pexels.com/photos/27298085/pexels-photo-27298085.jpeg?auto=compress&cs=tinysrgb&w=400"
  ];
  const SEM_BG = {
    1: "https://images.pexels.com/photos/32254525/pexels-photo-32254525.jpeg?auto=compress&cs=tinysrgb&w=500",
    2: "https://images.pexels.com/photos/19438560/pexels-photo-19438560.jpeg?auto=compress&cs=tinysrgb&w=500",
    3: "https://images.pexels.com/photos/32115898/pexels-photo-32115898.jpeg?auto=compress&cs=tinysrgb&w=500",
    4: "https://images.pexels.com/photos/32254523/pexels-photo-32254523.jpeg?auto=compress&cs=tinysrgb&w=500",
    5: "https://images.pexels.com/photos/27298085/pexels-photo-27298085.jpeg?auto=compress&cs=tinysrgb&w=500",
    6: "https://images.pexels.com/photos/31499386/pexels-photo-31499386.jpeg?auto=compress&cs=tinysrgb&w=500"
  };
  const semCache = {};

  async function getSem(sem) {
    if (!semCache[sem]) {
      semCache[sem] = await loadJSON(`data/sem${sem}.json`);
    }
    return semCache[sem];
  }

  function escHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // locked slots: har semester me 5 dikhao, baaki par tala
  function lockedCards(n) {
    let h = "";
    for (let k = 0; k < n; k++) {
      h += `<div class="expsub locked-card">
        <span class="lockicon">🔒</span>
        <h3>Coming Soon</h3>
        <p>New subject notes on the way</p>
        <span class="tag">Locked</span>
      </div>`;
    }
    return h;
  }

  async function showSem(sem) {
    const body = document.getElementById("expBody");
    const full = document.getElementById("expFullSem");
    if (!body) return;
    document.querySelectorAll("#expPills .exppill").forEach((p) => {
      p.classList.toggle("on", +p.dataset.sem === +sem);
    });
    if (full) full.href = `semester.html?sem=${sem}`;
    try {
      const d = await getSem(sem);
      const locked = Math.max(0, 5 - d.subjects.length);
      const pillSmall = document.querySelector("#expPills .exppill.on small");
      if (pillSmall) pillSmall.textContent = locked
        ? `${d.subjects.length} subjects · ${locked} locked`
        : `${d.subjects.length} subjects`;
      body.innerHTML = d.subjects.map((s, i) => `
        <div class="expsub">
          <button class="expsub-head" data-sub="${escHtml(s.id)}">
            <img class="expcov" src="${MOTIF_PHOTOS[i % 5].replace("w=200", "w=600")}" alt="${escHtml(s.name)}" loading="lazy" onerror="this.onerror=null;this.src='assets/m${(i % 5) + 1}.svg';" />
            <span class="trow">
              <span class="t"><b>${escHtml(s.name)}</b><small>${s.topics.length} topics · Sem ${sem}</small></span>
              <span class="chev">⌄</span>
            </span>
          </button>
          <div class="exptopics"><div class="expchips">
            ${s.topics.map((t) => `<a href="topic.html?sem=${sem}&sub=${encodeURIComponent(s.id)}&t=${t.id}"><span class="n">${t.id}</span>${escHtml(t.title)}</a>`).join("")}
          </div></div>
        </div>`).join("") + lockedCards(locked);
      body.querySelectorAll(".expsub-head").forEach((h) => {
        h.addEventListener("click", () => {
          const card = h.closest(".expsub");
          const was = card.classList.contains("open");
          body.querySelectorAll(".expsub.open").forEach((o) => o.classList.remove("open"));
          if (!was) card.classList.add("open");
        });
      });
    } catch (_) {
      body.innerHTML = `<div class="paper"><div class="empty">Semester ${sem} could not load — open via http server.</div></div>`;
    }
  }

  function buildExplorer() {
    const pills = document.getElementById("expPills");
    if (!pills) return;
    pills.innerHTML = [1, 2, 3, 4, 5, 6].map((s) =>
      `<button class="exppill${s === 1 ? " on" : ""}" data-sem="${s}" style="--sbg:url('${SEM_BG[s]}')">
        <span class="pnum">${String(s).padStart(2, "0")}</span>
        <span class="plab">Semester ${s}</span>
        <small>…</small>
      </button>`).join("");
    pills.querySelectorAll(".exppill").forEach((p) => {
      p.addEventListener("click", () => showSem(+p.dataset.sem));
    });
    showSem(1);
  }

  function init() {
    counters(); faq(); leadForm(); buildLibrary(); buildExplorer();
  }

  document.addEventListener("DOMContentLoaded", init);
  return { init };
})();
