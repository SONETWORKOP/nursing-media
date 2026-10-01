/* ============================================================
   EDU-NOTES • premium.js — scroll reveal, navbar glow,
   card spotlight (shine follows mouse, no tilt)
   ============================================================ */
"use strict";

window.EduPremium = (() => {
  function reveal() {
    const els = document.querySelectorAll(".reveal");
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => io.observe(el));

    // dynamically added .reveal nodes
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList?.contains("reveal")) io.observe(n);
          n.querySelectorAll?.(".reveal").forEach((el) => io.observe(el));
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function navbar() {
    const nav = document.querySelector(".mast, .navbar");
    if (!nav) return;
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function spotlight() {
    if (window.matchMedia("(hover: none)").matches) return;
    document.addEventListener("mousemove", (e) => {
      const card = e.target.closest?.(".sem-card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    }, { passive: true });
  }

  function toTop() {
    const b = document.createElement("button");
    b.id = "toTop";
    b.title = "Upar jao";
    b.setAttribute("aria-label", "Back to top");
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    b.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    document.body.appendChild(b);
    window.addEventListener("scroll", () => b.classList.toggle("show", window.scrollY > 600), { passive: true });
  }

  function init() { reveal(); navbar(); spotlight(); toTop(); }
  document.addEventListener("DOMContentLoaded", init);
  return { init };
})();
