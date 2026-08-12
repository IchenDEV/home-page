/**
 * Hero background: a wireframe terrain receding into fog, a drifting particle
 * field, and a slowly-morphing core solid. Colors are driven by the active
 * terminal theme so the 3D layer re-tints along with the rest of the page.
 */

import * as THREE from 'three';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initHeroScene(canvas, { getPalette }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch {
    return null; // No WebGL — the page is fully usable without it.
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
  camera.position.set(0, 3.4, 15);

  const fog = new THREE.FogExp2(0x060708, 0.031);
  scene.fog = fog;

  // ------------------------------------------------------------- terrain --
  // A grid that ripples like a slow signal trace and scrolls toward the camera.
  const COLS = 74;
  const ROWS = 74;
  const SIZE = 150;
  const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, COLS, ROWS);
  terrainGeo.rotateX(-Math.PI / 2);
  const basePos = terrainGeo.attributes.position.array.slice();

  const terrainMat = new THREE.MeshBasicMaterial({
    color: 0x34ff5a,
    wireframe: true,
    transparent: true,
    opacity: 0.28,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.position.y = -6;
  scene.add(terrain);

  // ------------------------------------------------------------ particles --
  const COUNT = REDUCED ? 320 : 1100;
  const pPos = new Float32Array(COUNT * 3);
  const pSeed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 90;
    pPos[i * 3 + 1] = Math.random() * 34 - 6;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    pSeed[i] = Math.random() * Math.PI * 2;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0x73e8ff,
    size: 0.14,
    transparent: true,
    opacity: 0.65,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // ----------------------------------------------------------------- core --
  const core = new THREE.Group();
  core.position.set(0, 4.2, -2);
  scene.add(core);

  const coreGeo = new THREE.IcosahedronGeometry(3.1, 1);
  const coreBase = coreGeo.attributes.position.array.slice();
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x34ff5a,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
  });
  core.add(new THREE.Mesh(coreGeo, coreMat));

  // A second, larger shell rotating the other way reads as depth.
  const shellGeo = new THREE.IcosahedronGeometry(4.6, 0);
  const shellMat = new THREE.MeshBasicMaterial({
    color: 0x73e8ff,
    wireframe: true,
    transparent: true,
    opacity: 0.16,
  });
  const shell = new THREE.Mesh(shellGeo, shellMat);
  core.add(shell);

  const vertGeo = new THREE.BufferGeometry();
  vertGeo.setAttribute('position', new THREE.BufferAttribute(coreGeo.attributes.position.array.slice(), 3));
  const vertMat = new THREE.PointsMaterial({ color: 0x34ff5a, size: 0.2, transparent: true, opacity: 0.9, depthWrite: false });
  core.add(new THREE.Points(vertGeo, vertMat));

  // -------------------------------------------------------------- pointer --
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // Scroll pushes the camera forward and tips it down slightly.
  let scroll = 0;
  const setScroll = (v) => { scroll = v; };

  // -------------------------------------------------------------- palette --
  // Set by resize(); both palette and layout feed the same opacity decision.
  let portrait = false;

  function applyPalette() {
    const p = getPalette();
    terrainMat.color.set(p.green);
    coreMat.color.set(p.green);
    vertMat.color.set(p.green);
    particleMat.color.set(p.cyan);
    shellMat.color.set(p.cyan);
    fog.color.set(p.bg);

    // The light theme needs far less ink or the 3D layer overpowers the text,
    // and on portrait the core sits closer to the copy so it is dialled back.
    const light = p.isLight;
    terrainMat.opacity = light ? 0.16 : 0.28;
    coreMat.opacity = portrait ? 0.32 : (light ? 0.28 : 0.5);
    shellMat.opacity = portrait ? 0.1 : (light ? 0.1 : 0.16);
    vertMat.opacity = portrait ? 0.5 : 0.9;
    particleMat.opacity = light ? 0.4 : 0.65;
    fog.density = light ? 0.036 : 0.031;
  }
  applyPalette();

  // --------------------------------------------------------------- resize --
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (canvas.width === w && canvas.height === h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    // On a narrow screen the hero copy spans the full width, so the core has to
    // move up out of the text and shrink — otherwise it sits right behind it.
    portrait = camera.aspect < 1.05;
    core.position.set(0, portrait ? 11.5 : 4.2, -2);
    core.scale.setScalar(portrait ? 0.58 : 1);
    applyPalette();
  }

  // ---------------------------------------------------------------- frame --
  const clock = new THREE.Clock();
  let running = true;
  let raf = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!running) return;
    resize();

    const t = clock.getElapsedTime();
    const slow = REDUCED ? 0.25 : 1;

    // Ripple the terrain. Two crossing waves keep it from looking periodic.
    const pos = terrainGeo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = basePos[i];
      const z = basePos[i + 2];
      pos[i + 1] =
        Math.sin(x * 0.13 + t * 0.55 * slow) * 1.15 +
        Math.cos(z * 0.11 - t * 0.4 * slow) * 1.0 +
        Math.sin((x + z) * 0.06 + t * 0.25 * slow) * 0.8;
    }
    terrainGeo.attributes.position.needsUpdate = true;

    // Breathe the core along its vertex normals.
    const cpos = coreGeo.attributes.position.array;
    const vpos = vertGeo.attributes.position.array;
    for (let i = 0; i < cpos.length; i += 3) {
      const bx = coreBase[i];
      const by = coreBase[i + 1];
      const bz = coreBase[i + 2];
      const k = 1 + Math.sin(t * 0.9 * slow + (bx + by + bz) * 0.55) * 0.055;
      cpos[i] = bx * k; cpos[i + 1] = by * k; cpos[i + 2] = bz * k;
      vpos[i] = bx * k; vpos[i + 1] = by * k; vpos[i + 2] = bz * k;
    }
    coreGeo.attributes.position.needsUpdate = true;
    vertGeo.attributes.position.needsUpdate = true;

    core.rotation.y = t * 0.16 * slow;
    core.rotation.x = Math.sin(t * 0.22 * slow) * 0.16;
    shell.rotation.y = -t * 0.24 * slow;
    shell.rotation.z = t * 0.1 * slow;

    // Particles drift upward and wrap, so the field never empties out.
    const ppos = particleGeo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      const j = i * 3;
      ppos[j + 1] += 0.012 * slow;
      ppos[j] += Math.sin(t * 0.4 + pSeed[i]) * 0.004;
      if (ppos[j + 1] > 28) ppos[j + 1] = -6;
    }
    particleGeo.attributes.position.needsUpdate = true;
    particles.rotation.y = t * 0.012 * slow;

    // Ease the camera toward the pointer; scroll dollies it through the scene.
    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;
    camera.position.x = pointer.x * 2.6;
    camera.position.y = 3.4 - pointer.y * 1.5 + scroll * 5.5;
    camera.position.z = 15 - scroll * 9;
    camera.lookAt(0, 3.4 + scroll * 3.2, -2);

    renderer.render(scene, camera);
  }
  frame();

  // Stop burning GPU on a hidden tab.
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) clock.getDelta();
  });

  return {
    setScroll,
    refreshPalette: applyPalette,
    dispose() {
      cancelAnimationFrame(raf);
      renderer.dispose();
    },
  };
}
