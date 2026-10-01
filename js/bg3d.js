/* ============================================================
   EDU-NOTES • bg3d.js — lightweight animated 3D background
   three.js CDN se load hota hai; offline ho to silent skip
   (site bina 3D background ke bhi poori chalegi)
   ============================================================ */
"use strict";

window.EduBg = (() => {
  function start() {
    const canvas = document.getElementById("bg3d");
    if (!canvas) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    script.onload = () => initScene(canvas);
    script.onerror = () => canvas.remove(); // offline fallback
    document.head.appendChild(script);
    // agar 6 sec me load na ho to hata do
    setTimeout(() => { if (!canvas.dataset.live) canvas.remove(); }, 6000);
  }

  function initScene(canvas) {
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
      camera.position.z = 14;

      // floating wireframe shapes — books/notes vibe
      const group = new THREE.Group();
      const geoBox = new THREE.BoxGeometry(1.4, 1.8, 0.25);
      const geoOct = new THREE.OctahedronGeometry(1.1);
      const mat1 = new THREE.MeshBasicMaterial({ color: 0x6c8cff, wireframe: true, transparent: true, opacity: 0.5 });
      const mat2 = new THREE.MeshBasicMaterial({ color: 0xb06cff, wireframe: true, transparent: true, opacity: 0.4 });
      const mat3 = new THREE.MeshBasicMaterial({ color: 0x3ddad7, wireframe: true, transparent: true, opacity: 0.4 });

      const shapes = [];
      const spots = [[-9, 3, -4], [8, 4, -5], [-7, -4, -3], [9, -3, -4], [0, 5, -7], [-3, 0, -6], [4, 1, -5]];
      spots.forEach(([x, y, z], i) => {
        const mesh = new THREE.Mesh(i % 3 === 0 ? geoBox : i % 3 === 1 ? geoOct : geoBox,
          i % 3 === 0 ? mat1 : i % 3 === 1 ? mat2 : mat3);
        mesh.position.set(x, y, z);
        mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        mesh.userData.spin = { x: (Math.random() - 0.5) * 0.01, y: (Math.random() - 0.5) * 0.01 };
        mesh.userData.baseY = y;
        group.add(mesh);
        shapes.push(mesh);
      });
      scene.add(group);

      // particles (stars/dust)
      const pGeo = new THREE.BufferGeometry();
      const N = 220;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 40;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 24;
        pos[i * 3 + 2] = -Math.random() * 12;
      }
      pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x8fa2ff, size: 0.08, transparent: true, opacity: 0.7 }));
      scene.add(points);

      function resize() {
        renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
      }
      window.addEventListener("resize", resize);
      resize();
      canvas.dataset.live = "1";

      let mx = 0, my = 0;
      window.addEventListener("mousemove", (e) => {
        mx = (e.clientX / innerWidth - 0.5);
        my = (e.clientY / innerHeight - 0.5);
      });

      const clock = new THREE.Clock();
      (function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        shapes.forEach((s, i) => {
          s.rotation.x += s.userData.spin.x;
          s.rotation.y += s.userData.spin.y;
          s.position.y = s.userData.baseY + Math.sin(t * 0.6 + i) * 0.5;
        });
        points.rotation.y = t * 0.02;
        group.rotation.y += ((mx * 0.4) - group.rotation.y) * 0.03;
        group.rotation.x += ((my * 0.3) - group.rotation.x) * 0.03;
        renderer.render(scene, camera);
      })();
    } catch (e) {
      canvas.remove();
    }
  }

  return { start };
})();
