/* ============================================
   PLATONIC SOLIDS — Wireframe 3D Embeds
   Target: .process_platonic-embed[data-solid]
   Dependencies: Three.js (loaded below)
   Safe to remove: Yes — delete script tag from footer
   Changed: 2026-04-05 — Initial build
   ============================================ */
(function () {
  if (window.__tenPlatonicInit) return;
  window.__tenPlatonicInit = true;

  const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

  /* --- Load Three.js if not already present --- */
  function loadThree(callback) {
    if (window.THREE) { callback(); return; }
    const s = document.createElement('script');
    s.src = THREE_CDN;
    s.onload = callback;
    s.onerror = () => console.warn('[PlatonicSolids] Failed to load Three.js');
    document.head.appendChild(s);
  }

  /* --- Geometry builders --- */
  function createGeometry(type) {
    switch (type) {
      case 'hexahedron':   return new THREE.BoxGeometry(1.6, 1.6, 1.6);
      case 'octahedron':   return new THREE.OctahedronGeometry(1.1);
      case 'icosahedron':  return new THREE.IcosahedronGeometry(1.2);
      case 'tetrahedron':  return new THREE.TetrahedronGeometry(1.3);
      case 'dodecahedron': return new THREE.DodecahedronGeometry(1.1);
      default:             return new THREE.IcosahedronGeometry(1.2);
    }
  }

  /* --- Build one solid instance --- */
  function initSolid(container) {
    const solidType = container.getAttribute('data-solid') || 'icosahedron';
    const rect = container.getBoundingClientRect();
    const w = rect.width || 400;
    const h = rect.height || 300;

    /* Scene */
    const scene = new THREE.Scene();

    /* Camera */
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    /* Renderer */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    /* Geometry + wireframe edges */
    const geometry = createGeometry(solidType);

    /* Edge lines — glowing wireframe */
    const edgeGeo = new THREE.EdgesGeometry(geometry);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      linewidth: 1,
    });
    const wireframe = new THREE.LineSegments(edgeGeo, edgeMat);
    scene.add(wireframe);

    /* Faint face mesh for depth */
    const faceMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.03,
      side: THREE.DoubleSide,
    });
    const faceMesh = new THREE.Mesh(geometry, faceMat);
    scene.add(faceMesh);

    /* Vertex dots */
    const vertices = [];
    const posAttr = geometry.getAttribute('position');
    const seen = new Set();
    for (let i = 0; i < posAttr.count; i++) {
      const key = `${posAttr.getX(i).toFixed(4)},${posAttr.getY(i).toFixed(4)},${posAttr.getZ(i).toFixed(4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        vertices.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      }
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const dotMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.06,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });
    const dots = new THREE.Points(dotGeo, dotMat);
    scene.add(dots);

    /* --- Build animation state --- */
    let buildProgress = 0;
    let built = false;
    const totalEdgeVerts = edgeGeo.getAttribute('position').count;

    /* Store original edge positions for build reveal */
    const origEdgePos = edgeGeo.getAttribute('position').array.slice();
    /* Start with all edges collapsed to center */
    const edgePosArr = edgeGeo.getAttribute('position').array;
    for (let i = 0; i < edgePosArr.length; i++) {
      edgePosArr[i] = 0;
    }
    edgeGeo.getAttribute('position').needsUpdate = true;

    /* Start face and dots invisible */
    faceMat.opacity = 0;
    dotMat.opacity = 0;

    function updateBuild(progress) {
      /* Edges expand from center */
      const p = Math.min(1, Math.max(0, progress));
      const posArr = edgeGeo.getAttribute('position').array;
      for (let i = 0; i < origEdgePos.length; i++) {
        posArr[i] = origEdgePos[i] * p;
      }
      edgeGeo.getAttribute('position').needsUpdate = true;

      /* Edge opacity ramps up */
      edgeMat.opacity = 0.35 * p;

      /* Face and dots fade in during second half */
      const p2 = Math.max(0, (p - 0.5) * 2);
      faceMat.opacity = 0.03 * p2;
      dotMat.opacity = 0.6 * p2;
    }

    /* --- Scroll-triggered build (uses GSAP if available) --- */
    function initScrollBuild() {
      if (window.gsap && window.ScrollTrigger) {
        gsap.registerPlugin(ScrollTrigger);

        const proxy = { progress: 0 };
        gsap.to(proxy, {
          progress: 1,
          duration: 1.5,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: container,
            start: 'top 85%',
            end: 'top 35%',
            toggleActions: 'play none none reverse',
            id: 'platonic-build-' + solidType,
            onUpdate: function (self) {
              updateBuild(self.progress);
            },
            onLeaveBack: function () {
              updateBuild(0);
              built = false;
            },
            onEnter: function () {
              built = false;
            },
            onComplete: function () {
              built = true;
            },
          },
        });
      } else {
        /* Fallback: just build immediately */
        updateBuild(1);
        built = true;
      }
    }

    /* --- Drag rotation --- */
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let rotVel = { x: 0, y: 0 };
    const damping = 0.92;
    const sensitivity = 0.008;

    function onPointerDown(e) {
      isDragging = true;
      prevMouse.x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      prevMouse.y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      renderer.domElement.style.cursor = 'grabbing';
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      const cx = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const cy = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      rotVel.y = (cx - prevMouse.x) * sensitivity;
      rotVel.x = (cy - prevMouse.y) * sensitivity;
      prevMouse.x = cx;
      prevMouse.y = cy;
    }

    function onPointerUp() {
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    }

    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('mousedown', onPointerDown);
    renderer.domElement.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);

    /* --- Idle auto-rotation --- */
    const idleSpeed = { x: 0.002, y: 0.003 };

    /* --- Resize handler --- */
    function onResize() {
      const r = container.getBoundingClientRect();
      const nw = r.width || 400;
      const nh = r.height || 300;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    }

    let resizeTimer;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResize, 100);
    });
    resizeObserver.observe(container);

    /* --- Render loop --- */
    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);

      if (!isDragging) {
        /* Apply damping to drag velocity */
        rotVel.x *= damping;
        rotVel.y *= damping;

        /* Idle rotation when velocity is negligible */
        if (Math.abs(rotVel.x) < 0.0001 && Math.abs(rotVel.y) < 0.0001) {
          rotVel.x = 0;
          rotVel.y = 0;
          wireframe.rotation.x += idleSpeed.x;
          wireframe.rotation.y += idleSpeed.y;
        }
      }

      /* Apply rotation to all objects together */
      wireframe.rotation.x += rotVel.x;
      wireframe.rotation.y += rotVel.y;
      faceMesh.rotation.copy(wireframe.rotation);
      dots.rotation.copy(wireframe.rotation);

      renderer.render(scene, camera);
    }

    /* --- Visibility optimization --- */
    const visObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!animId) animate();
          } else {
            if (animId) {
              cancelAnimationFrame(animId);
              animId = null;
            }
          }
        });
      },
      { threshold: 0.05 }
    );
    visObserver.observe(container);

    /* Start */
    initScrollBuild();
    animate();
  }

  /* --- Initialize all embeds --- */
  function init() {
    const containers = document.querySelectorAll('.process_platonic-embed[data-solid]');
    if (!containers.length) return;
    containers.forEach(initSolid);
  }

  /* --- Entry point --- */
  function boot() {
    loadThree(() => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    });
  }

  /* Webflow-aware boot */
  if (window.Webflow) {
    window.Webflow.push(boot);
  } else {
    boot();
  }
})();
