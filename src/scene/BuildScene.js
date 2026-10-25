import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { makePart, assignTargets } from "./placeholders.js";
import { MeasureGuide } from "./MeasureGuide.js";
import { makeDuck } from "./duck.js";

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const ONE = new THREE.Vector3(1, 1, 1);
const BLACK = new THREE.Color(0);
const SIM_SECONDS = 4.2;

// One renderer for the whole app; Stage components hand it a container with mount().
export class BuildScene {
  constructor({ onPick } = {}) {
    this.onPick = onPick;
    this.meshes = new Map(); // sku -> THREE.Group[] (dying groups stay until they shrink away)
    this.order = [];
    this.glowSku = null;
    this.sim = null;
    this.mode = "home";
    this.frameListeners = new Set();

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.set(4.6, 3.1, 4.9);

    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.target.set(0, 0.45, 0);
    Object.assign(c, { enableDamping: true, dampingFactor: 0.08, minDistance: 3.2, maxDistance: 10, maxPolarAngle: 1.42, enablePan: false, autoRotateSpeed: 1.1 });

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8090b0, 2.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
    sun.shadow.radius = 6;
    this.scene.add(sun);
    this.rim = new THREE.DirectionalLight(0x9aa8f0, 1.1);
    this.rim.position.set(-4, 3, -3);
    this.scene.add(this.rim);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.16 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.robot = new THREE.Group();
    this.scene.add(this.robot);
    // The MicroDuck stands beside the rover on the home screen only.
    this.duck = makeDuck();
    this.duck.position.set(-0.4, 0, 1.6);
    this.duck.rotation.y = 0.5;
    this.duck.scale.setScalar(0.9);
    this.scene.add(this.duck);

    this.measure = new MeasureGuide();
    this.measureOn = false;
    this.scene.add(this.measure.group);
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = "scene-labels";
    this.robotBox = new THREE.Box3();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.bindPicking();
    this.applyTheme();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  mount(el) {
    this.container = el;
    el.prepend(this.renderer.domElement);
    this.renderer.domElement.after(this.labelRenderer.domElement);
    this.resizeObserver.disconnect();
    this.resizeObserver.observe(el);
    this.resize();
  }

  setMode(mode) {
    this.mode = mode;
    this.controls.autoRotate = mode === "home";
    this.controls.enableZoom = mode === "build";
    this.duck.visible = mode === "home";
    if (mode === "home") this.camera.position.set(4.6, 3.1, 4.9);
  }

  resize() {
    const el = this.container;
    if (!el || !el.clientWidth || !el.clientHeight) return;
    this.renderer.setSize(el.clientWidth, el.clientHeight, false);
    this.labelRenderer.setSize(el.clientWidth, el.clientHeight);
    this.camera.aspect = el.clientWidth / el.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  applyTheme() {
    const dark = document.documentElement.dataset.theme === "dark";
    if (this.grid) this.scene.remove(this.grid);
    this.grid = new THREE.GridHelper(16, 32, new THREE.Color(cssVar("--grid")), new THREE.Color(cssVar("--grid2")));
    this.grid.position.y = 0.001;
    this.scene.add(this.grid);
    this.scene.fog = new THREE.Fog(new THREE.Color(cssVar("--bg")), 7, 15);
    this.ground.material.opacity = dark ? 0.38 : 0.16;
    this.rim.color.set(cssVar("--cool"));
    this.measure.setColors(cssVar("--muted"), cssVar("--cool"));
    this.setGlow(this.glowSku);
  }

  // Shows the ruler and dimension lines in the build view; unit is "mm" or "in".
  setMeasure(on, unit) {
    this.measureOn = on;
    this.measure.setUnit(unit);
    if (!on) this.measure.hide();
  }

  // build: { sku: qty } in insertion order; parts: sku -> part
  setBuild(build, parts, { animate = true } = {}) {
    for (const [sku, qty] of Object.entries(build)) {
      const list = this.meshes.get(sku) ?? [];
      this.meshes.set(sku, list);
      const live = list.filter((g) => !g.userData.dying);
      for (let n = live.length; n < qty; n++) {
        const g = makePart(parts[sku]);
        g.userData.spawn = animate ? "drop" : "place";
        list.push(g);
        this.robot.add(g);
      }
      for (let n = live.length; n > qty; n--) live[n - 1].userData.dying = true;
    }
    for (const [sku, list] of this.meshes) if (!(sku in build)) list.forEach((g) => (g.userData.dying = true));

    const live = Object.keys(build).flatMap((sku) => this.meshes.get(sku).filter((g) => !g.userData.dying));
    assignTargets(live);
    for (const g of live) {
      if (!g.userData.spawn) continue;
      g.position.copy(g.userData.target);
      if (g.userData.spawn === "drop") {
        g.position.y += 2.6;
        g.scale.setScalar(0.7);
      }
      delete g.userData.spawn;
    }
    this.setGlow(this.glowSku);
  }

  setGlow(sku) {
    this.glowSku = sku;
    const cool = new THREE.Color(cssVar("--cool") || "#7D93E8");
    for (const [s, list] of this.meshes)
      for (const g of list)
        g.traverse((o) => {
          if (!o.isMesh || o.userData.keepEmissive || !o.material.emissive) return;
          o.material.emissive.copy(s === sku ? cool : BLACK);
          o.material.emissiveIntensity = s === sku ? 0.45 : 0;
        });
  }

  // Screen position (container pixels) of the first placed instance of a part, or null if it isn't on screen.
  project(sku) {
    const g = this.meshes.get(sku)?.find((m) => !m.userData.dying);
    if (!g || !this.container) return null;
    const v = g.getWorldPosition(new THREE.Vector3());
    v.y += 0.12;
    v.project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.container.clientWidth, y: ((1 - v.y) / 2) * this.container.clientHeight };
  }

  onFrame(fn) {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  simulate(onDone) {
    this.sim = { t: 0, onDone };
  }

  bindPicking() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let down = null;
    el.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
    el.addEventListener("pointerup", (e) => {
      if (!down || this.mode !== "build" || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const rect = el.getBoundingClientRect();
      ptr.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ptr, this.camera);
      let o = ray.intersectObjects(this.robot.children, true)[0]?.object;
      while (o && !o.userData.sku) o = o.parent;
      this.onPick?.(o ? o.userData.sku : null);
    });
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const k = 1 - Math.exp(-dt * 9);

    for (const [sku, list] of this.meshes) {
      for (let i = list.length - 1; i >= 0; i--) {
        const g = list[i];
        if (g.userData.dying) {
          g.scale.multiplyScalar(1 - k * 1.4);
          if (g.scale.x < 0.05) {
            this.robot.remove(g);
            list.splice(i, 1);
          }
          continue;
        }
        g.position.lerp(g.userData.target, k);
        g.scale.lerp(ONE, k);
      }
      if (!list.length) this.meshes.delete(sku);
    }

    if (this.sim) {
      const s = this.sim;
      s.t += dt;
      const a = Math.min(s.t / SIM_SECONDS, 1) * Math.PI * 2;
      const R = 1.5;
      this.robot.position.set(R * Math.sin(a), 0, R - R * Math.cos(a));
      this.robot.rotation.y = a;
      this.robot.traverse((o) => { if (o.name === "spin") o.rotation.z -= dt * 9; });
      if (s.t >= SIM_SECONDS) {
        this.sim = null;
        this.robot.position.set(0, 0, 0);
        this.robot.rotation.y = 0;
        s.onDone?.();
      }
    }

    if (this.measureOn && this.mode === "build" && !this.sim) {
      this.measure.update(this.robotBox.setFromObject(this.robot));
    } else if (this.measure.group.visible) {
      this.measure.hide();
    }

    if (this.duck.visible) {
      const t = this.clock.elapsedTime;
      this.duck.position.y = Math.abs(Math.sin(t * 2.2)) * 0.03;
      const head = this.duck.getObjectByName("head");
      if (head) { head.rotation.z = Math.sin(t * 1.6) * 0.1; head.rotation.y = Math.sin(t * 0.8) * 0.25; }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    for (const fn of this.frameListeners) fn();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
