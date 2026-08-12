/**
 * The contribution calendar as an extruded 3D bar field.
 * One instanced box per day; height and color both encode the commit count.
 * Drag to orbit, hover for a tooltip.
 */

import * as THREE from 'three';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CELL = 1;      // grid spacing
const BAR = 0.78;    // bar footprint
const MAX_H = 7;     // tallest bar in world units

export function initContribScene(canvas, days, { getPalette, tooltip }) {
  if (!days.length) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

  const weeks = Math.ceil(days.length / 7);
  const width = weeks * CELL;
  const depth = 7 * CELL;

  const group = new THREE.Group();
  scene.add(group);

  // Counts are heavily skewed (a 108-commit day next to dozens of 1s), so the
  // height uses a sqrt ramp — otherwise every normal day flattens to nothing.
  const max = Math.max(...days.map((d) => d.count), 1);
  const heightFor = (c) => 0.12 + Math.sqrt(c / max) * MAX_H;

  // Levels match GitHub's own 0-4 bucketing.
  const levelFor = (c) => {
    if (c <= 0) return 0;
    const r = c / max;
    if (r <= 0.12) return 1;
    if (r <= 0.3) return 2;
    if (r <= 0.6) return 3;
    return 4;
  };

  const geo = new THREE.BoxGeometry(BAR, 1, BAR);
  geo.translate(0, 0.5, 0); // pivot at the base so scale.y grows upward
  const mat = new THREE.MeshLambertMaterial({ transparent: true });
  const mesh = new THREE.InstancedMesh(geo, mat, days.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  const dummy = new THREE.Object3D();
  const heights = new Float32Array(days.length);
  const levels = new Uint8Array(days.length);

  days.forEach((d, i) => {
    heights[i] = heightFor(d.count);
    levels[i] = levelFor(d.count);
  });

  function layout(grow = 1) {
    for (let i = 0; i < days.length; i++) {
      const week = Math.floor(i / 7);
      const day = i % 7;
      dummy.position.set(week * CELL - width / 2, 0, day * CELL - depth / 2);
      dummy.scale.set(1, Math.max(heights[i] * grow, 0.02), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  layout(REDUCED ? 1 : 0);

  // ------------------------------------------------------------- lighting --
  const ambient = new THREE.AmbientLight(0xffffff, 0.62);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(-14, 20, 12);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(16, 8, -12);
  scene.add(rim);

  // Base plate grounds the bars.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(width + 1, 0.1, depth + 1),
    new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.28 }),
  );
  plate.position.y = -0.06;
  group.add(plate);

  // -------------------------------------------------------------- palette --
  const color = new THREE.Color();
  const ramp = [];

  function applyPalette() {
    const p = getPalette();
    const base = new THREE.Color(p.green);
    const dim = new THREE.Color(p.line);
    ramp.length = 0;
    // Level 0 stays near the grid line color; 1-4 ramp up toward the accent.
    ramp.push(dim.clone());
    for (let l = 1; l <= 4; l++) {
      ramp.push(dim.clone().lerp(base, 0.25 + (l / 4) * 0.75));
    }
    for (let i = 0; i < days.length; i++) {
      color.copy(ramp[levels[i]]);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    plate.material.color.set(p.line);
    key.intensity = p.isLight ? 0.85 : 1.05;
    ambient.intensity = p.isLight ? 0.8 : 0.62;
    return ramp;
  }
  applyPalette();

  // ---------------------------------------------------------------- orbit --
  // Default view keeps the 53-week axis roughly horizontal; a hard turn makes
  // the strip run diagonally and waste most of the (very wide) canvas.
  const HOME_Y = -0.2;
  const rot = { x: 0.62, y: HOME_Y, tx: 0.62, ty: HOME_Y };
  let dragging = false;
  let last = { x: 0, y: 0 };
  let idle = 0;
  let swayT = 0;
  let userMoved = false;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    idle = 0;
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerleave', () => {
    dragging = false;
    hideTip();
  });

  // ------------------------------------------------------------- tooltip ---
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = -1;
  let pointerInside = false;

  const fmt = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' });

  function showTip(i, cx, cy) {
    const d = days[i];
    const date = fmt.format(new Date(`${d.date}T00:00:00`));
    tooltip.textContent = d.count > 0 ? `${date} — ${d.count} 次贡献` : `${date} — 没有贡献`;
    tooltip.style.left = `${cx}px`;
    tooltip.style.top = `${cy}px`;
    tooltip.classList.add('on');
  }
  function hideTip() {
    tooltip.classList.remove('on');
    hovered = -1;
    pointerInside = false;
  }

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    pointerInside = true;

    if (dragging) {
      rot.ty += (e.clientX - last.x) * 0.006;
      rot.tx += (e.clientY - last.y) * 0.004;
      rot.tx = Math.max(0.12, Math.min(1.35, rot.tx));
      last = { x: e.clientX, y: e.clientY };
      userMoved = true;
      hideTip();
      pointerInside = true;
      idle = 0;
      return;
    }

    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (hit && hit.instanceId != null) {
      hovered = hit.instanceId;
      showTip(hovered, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      tooltip.classList.remove('on');
      hovered = -1;
    }
  }, { passive: true });

  // --------------------------------------------------------------- resize --
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (canvas.width === w && canvas.height === h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /**
   * Fit both axes independently. The grid is very wide and very shallow, so a
   * single bounding-sphere fit would push the camera far too far back and
   * render the bars as a thin sliver. Recomputed per frame because the required
   * distance changes as the view rotates.
   */
  function fitDistance() {
    const tanV = Math.tan((camera.fov * Math.PI) / 180 / 2);
    const halfW = (width / 2 + 1.5) * Math.abs(Math.cos(rot.y)) + (depth / 2) * Math.abs(Math.sin(rot.y));
    const halfV = (depth / 2 + 1) * Math.sin(rot.x) + MAX_H * Math.cos(rot.x) * 0.6;
    const distH = halfW / (tanV * Math.max(camera.aspect, 0.1));
    const distV = halfV / tanV;
    return Math.max(distH, distV) * 1.1;
  }

  // ---------------------------------------------------------------- frame --
  const clock = new THREE.Clock();
  let grow = REDUCED ? 1 : 0;
  let visible = true;
  let raf = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    if (document.hidden || !visible) return;
    resize();

    const dt = Math.min(clock.getDelta(), 0.05);

    // Bars rise on first reveal.
    if (grow < 1) {
      grow = Math.min(1, grow + dt * 0.85);
      layout(1 - (1 - grow) ** 3);
    }

    // Idle motion sways around the home angle instead of orbiting freely, so
    // the framing never wanders off. A user drag takes over permanently.
    if (!dragging && !pointerInside && !userMoved && !REDUCED) {
      idle += dt;
      if (idle > 1.2) {
        swayT += dt;
        rot.ty = HOME_Y + Math.sin(swayT * 0.35) * 0.16;
      }
    }
    rot.x += (rot.tx - rot.x) * 0.09;
    rot.y += (rot.ty - rot.y) * 0.09;

    const dist = fitDistance();
    camera.position.set(
      Math.sin(rot.y) * Math.cos(rot.x) * dist,
      Math.sin(rot.x) * dist,
      Math.cos(rot.y) * Math.cos(rot.x) * dist,
    );
    camera.lookAt(0, 1.2, 0);

    // Lift whatever the pointer is over.
    if (hovered >= 0) {
      const week = Math.floor(hovered / 7);
      const day = hovered % 7;
      dummy.position.set(week * CELL - width / 2, 0.35, day * CELL - depth / 2);
      dummy.scale.set(1, Math.max(heights[hovered], 0.02), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(hovered, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.lifted = hovered;
    } else if (mesh.userData.lifted != null) {
      const i = mesh.userData.lifted;
      const week = Math.floor(i / 7);
      const day = i % 7;
      dummy.position.set(week * CELL - width / 2, 0, day * CELL - depth / 2);
      dummy.scale.set(1, Math.max(heights[i], 0.02), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.lifted = null;
    }

    renderer.render(scene, camera);
  }
  frame();

  // Only animate while the section is actually on screen.
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; },
    { root: document.getElementById('viewport'), threshold: 0 });
  io.observe(canvas);

  return { refreshPalette: applyPalette, ramp, dispose() { cancelAnimationFrame(raf); io.disconnect(); renderer.dispose(); } };
}
