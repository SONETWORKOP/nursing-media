/* ============================================================
   EDU-NOTES • tilt.js — 3D mouse tilt + shine on .card3d
   Touch devices par auto-disabled (hover nahi hota)
   ============================================================ */
"use strict";

window.EduTilt = (() => {
  const MAX = 12; // max tilt degrees

  function bindCard(card) {
    let raf = null;
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", `${px * 100}%`);
      card.style.setProperty("--my", `${py * 100}%`);
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        card.style.transform =
          `perspective(900px) rotateY(${(px - 0.5) * MAX * 2}deg) ` +
          `rotateX(${(0.5 - py) * MAX * 2}deg) translateZ(8px)`;
      });
    });
    card.addEventListener("mouseleave", () => {
      if (raf) cancelAnimationFrame(raf);
      card.style.transition = "transform 0.5s cubic-bezier(.2,.8,.3,1.2)";
      card.style.transform = "perspective(900px) rotateY(0deg) rotateX(0deg)";
      setTimeout(() => { card.style.transition = ""; }, 500);
    });
  }

  function bind() {
    if (window.matchMedia("(hover: none)").matches) return; // mobile skip
    document.querySelectorAll(".card3d").forEach(bindCard);
  }

  // dynamically added cards ke liye observer
  const obs = new MutationObserver((muts) => {
    if (window.matchMedia("(hover: none)").matches) return;
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) {
          if (n.classList && n.classList.contains("card3d")) bindCard(n);
          n.querySelectorAll?.(".card3d").forEach(bindCard);
        }
      }
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    obs.observe(document.body, { childList: true, subtree: true });
  });

  return { bind };
})();
