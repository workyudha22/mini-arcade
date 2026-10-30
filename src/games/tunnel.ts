import * as THREE from 'three';
import { BaseGame, glowSprite, type StageUI } from '../core/stage';
import { sfx } from '../core/audio';
import { angleDelta, clamp, damp, rand, TAU } from '../core/util';

const ACCENT = 0x4ee1ff;
const DANGER = 0xff4d94;
const RADIUS = 2.55;
const RIB_COUNT = 26;
const RIB_GAP = 6.5;
const TRAIL = 24;
const SPAWN_Z = -146;
const SPACING = 30;

type Mode = 'idle' | 'play' | 'dead' | 'over';

interface Blade {
  group: THREE.Group;
  gapSize: number;
  spin: number;
  passed: boolean;
  z: number;
}

export class TunnelGame extends BaseGame {
  private cam: THREE.PerspectiveCamera;
  private orb = new THREE.Group();
  private blades: Blade[] = [];
  private ribs: THREE.Mesh[] = [];
  private stars: THREE.Points;
  private starPos: Float32Array;
  private trail: THREE.Line;
  private trailPos: Float32Array;
  private trailAngles: number[] = [];

  private angle = -Math.PI / 2;
  private target = -Math.PI / 2;
  private combo = 0;
  private gates = 0;
  private level = 1;
  private hudIn = 0;
  private elapsed = 0;
  private speed = 26;
  private spawnIn = 1.2;
  private lastGap = -Math.PI / 2;
  private gapSide = 1;
  private mode: Mode = 'idle';
  private deadIn = 0;
  private dragX: number | null = null;
  private keys = new Set<string>();

  private bladeMat = new THREE.MeshBasicMaterial({ color: DANGER });
  private bladeHaloMat = new THREE.MeshBasicMaterial({
    color: DANGER,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private capGeo = new THREE.SphereGeometry(0.3, 8, 8);

  constructor(host: HTMLElement, ui: StageUI) {
    super(host, ui);

    this.cam = new THREE.PerspectiveCamera(76, 1, 0.1, 320);
    this.cam.position.set(0, 0.5, 10);
    this.cam.lookAt(0, 0, -8);
    this.camera = this.cam;
    this.scene.fog = new THREE.FogExp2(0x070910, 0.0125);

    this.buildTunnel();
    this.buildOrb();
    const trail = this.buildTrail();
    this.trail = trail.line;
    this.trailPos = trail.positions;
    this.stars = this.buildStars();
    this.starPos = this.stars.geometry.getAttribute('position').array as Float32Array;

    for (const z of [-18, -34, -52]) this.spawnBlade(z, 1.9);
    this.orb.position.set(0, -RADIUS, 0);
    this.trailAngles = Array.from({ length: TRAIL }, () => -Math.PI / 2);

    this.bindInput();
    this.mount();
  }

  /* ---------------------------------------------------------------- */

  private buildTunnel() {
    const ribGeo = new THREE.TorusGeometry(4.55, 0.014, 3, 72);
    const ribMat = new THREE.MeshBasicMaterial({
      color: 0x1f6f85,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < RIB_COUNT; i++) {
      const rib = new THREE.Mesh(ribGeo, ribMat);
      rib.position.z = 6 - i * RIB_GAP;
      this.scene.add(rib);
      this.ribs.push(rib);
    }

    const pts: number[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const x = Math.cos(a) * 4.55;
      const y = Math.sin(a) * 4.55;
      pts.push(x, y, 4, x, y, -170);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: 0x17606f,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scene.add(lines);
  }

  private buildOrb() {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.022, 6, 40),
      new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    rim.name = 'rim';
    const glow = glowSprite(ACCENT, 1.9);
    this.orb.add(core, rim, glow);
    this.scene.add(this.orb);
  }

  private buildTrail() {
    const positions = new Float32Array(TRAIL * 3);
    const colors = new Float32Array(TRAIL * 3);
    const c = new THREE.Color(ACCENT);
    for (let i = 0; i < TRAIL; i++) {
      const fade = 1 - i / TRAIL;
      colors[i * 3] = c.r * fade;
      colors[i * 3 + 1] = c.g * fade;
      colors[i * 3 + 2] = c.b * fade;
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -RADIUS;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scene.add(line);
    return { line, positions };
  }

  private buildStars() {
    const count = 340;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = rand(1.2, 5.1);
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.sin(a) * r;
      positions[i * 3 + 2] = rand(-170, 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0x9fe8ff,
        size: 0.07,
        transparent: true,
        opacity: 0.65,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(stars);
    return stars;
  }

  private bindInput() {
    const el = this.renderer.domElement;

    this.listen<PointerEvent>(el, 'pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.dragX = e.clientX;
    });
    this.listen<PointerEvent>(el, 'pointermove', (e) => {
      if (this.dragX === null) return;
      const dx = e.clientX - this.dragX;
      this.dragX = e.clientX;
      if (this.mode !== 'play') return;
      this.target += dx * 0.016;
    });
    const endDrag = () => {
      this.dragX = null;
    };
    this.listen(el, 'pointerup', endDrag);
    this.listen(el, 'pointercancel', endDrag);

    this.listen<KeyboardEvent>(window, 'keydown', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') {
        e.preventDefault();
        this.keys.add(e.code);
      }
    });
    this.listen<KeyboardEvent>(window, 'keyup', (e) => this.keys.delete(e.code));
  }

  /* ---------------------------------------------------------------- */

  private spawnBlade(z: number, forcedGap?: number) {
    const gapSize = forcedGap ?? clamp(1.62 - this.elapsed * 0.008, 0.98, 1.62);
    const group = new THREE.Group();
    const arc = TAU - gapSize;
    const geo = new THREE.TorusGeometry(RADIUS, 0.2, 10, 96, arc);

    const core = new THREE.Mesh(geo, this.bladeMat);
    core.userData.disposeGeo = true;
    const halo = new THREE.Mesh(geo, this.bladeHaloMat);
    halo.scale.set(1.12, 1.12, 1);
    group.add(core, halo);

    for (const a of [0, arc]) {
      const cap = new THREE.Mesh(this.capGeo, this.bladeMat);
      cap.position.set(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 0);
      cap.scale.setScalar(1.25);
      group.add(cap);
    }

    let gapCenter: number;
    if (this.blades.length === 0) {
      gapCenter = -Math.PI / 2;
    } else {
      // Small, alternating swings early on; wider as the run goes. A 180°
      // jump every gate made the first few gates unwinnable on touch.
      this.gapSide *= -1;
      const swing = Math.min(2.2, 0.55 + this.elapsed * 0.035);
      gapCenter =
        this.lastGap +
        this.gapSide * swing * rand(0.65, 1.05, this.rng) +
        rand(-0.15, 0.15, this.rng);
    }
    this.lastGap = gapCenter;

    const spinBase = this.elapsed < 12 ? 0 : Math.min(1, (this.elapsed - 12) / 25);
    const spin = rand(0.15, 0.4, this.rng) * spinBase * (this.rng() < 0.5 ? -1 : 1);

    group.rotation.z = gapCenter + gapSize / 2;
    group.position.z = z;

    const blade: Blade = { group, gapSize, spin, passed: false, z };
    this.scene.add(group);
    this.blades.push(blade);
  }

  private removeBlade(index: number) {
    const blade = this.blades[index];
    this.scene.remove(blade.group);
    blade.group.traverse((obj) => {
      if (obj.userData.disposeGeo) (obj as THREE.Mesh).geometry.dispose();
    });
    this.blades.splice(index, 1);
  }

  private clearBlades() {
    while (this.blades.length) this.removeBlade(this.blades.length - 1);
  }

  /* ---------------------------------------------------------------- */

  protected reset() {
    this.clearBlades();
    this.mode = 'play';
    this.elapsed = 0;
    this.speed = 26;
    this.spawnIn = 1.15;
    this.combo = 0;
    this.gates = 0;
    this.level = 1;
    this.hudIn = 0;
    this.angle = -Math.PI / 2;
    this.target = -Math.PI / 2;
    this.lastGap = -Math.PI / 2;
    this.gapSide = 1;
    this.orb.visible = true;
    this.orb.position.set(0, -RADIUS, 0);
    this.trailAngles = Array.from({ length: TRAIL }, () => this.angle);
    this.keys.clear();
    // Pre-place the first five gates on one consistent spacing so none of
    // them arrives back-to-back with the first procedurally spawned gate.
    for (let i = 0; i < 5; i++) this.spawnBlade(-26 - i * SPACING, 1.9);
    this.spawnIn = SPACING / 26;
    this.ui.setMid(this.hudText(), 0);
    sfx.start();
  }

  protected update(dt: number) {
    this.elapsed += this.mode === 'play' ? dt : 0;
    const t = performance.now() * 0.001;

    if (this.mode === 'play') {
      this.speed = 26 + Math.min(40, (this.level - 1) * 3.6);

      const kb = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) -
        (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
      if (kb) this.target += kb * 3.1 * dt;

      this.angle = damp(this.angle, this.target, 15, dt);
      this.orb.position.set(Math.cos(this.angle) * RADIUS, Math.sin(this.angle) * RADIUS, 0);

      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        this.spawnBlade(SPAWN_Z);
        this.spawnIn = (SPACING + rand(0, 6, this.rng)) / this.speed;
      }

      this.hudIn -= dt;
      if (this.hudIn <= 0) {
        this.hudIn = 0.1;
        this.ui.setMid(this.hudText(), (this.gates % 8) / 8);
      }
    } else if (this.mode === 'idle') {
      this.orb.position.set(0, -RADIUS + Math.sin(t * 1.6) * 0.08, 0);
    } else if (this.mode === 'dead') {
      this.deadIn -= dt;
      if (this.deadIn <= 0) {
        this.mode = 'over';
        this.finish();
      }
    }

    const scroll = this.mode === 'play' ? this.speed : this.mode === 'idle' ? 4 : 0.6;
    this.scrollScene(dt, scroll);

    for (let i = this.blades.length - 1; i >= 0; i--) {
      const b = this.blades[i];
      if (this.mode === 'play') {
        b.z += this.speed * dt;
        b.group.position.z = b.z;
        b.group.rotation.z += b.spin * dt;
        if (!b.passed && b.z >= 0) {
          b.passed = true;
          this.judge(b);
          if (this.mode !== 'play') continue;
        }
      }
      if (b.z > (this.mode === 'play' ? 3.2 : 500)) this.removeBlade(i);
    }

    this.updateTrail();

    const rim = this.orb.getObjectByName('rim');
    if (rim) {
      rim.rotation.z += dt * 1.4;
      const s = 1 + Math.sin(t * 4) * 0.07;
      rim.scale.setScalar(s);
    }
  }

  private scrollScene(dt: number, speed: number) {
    for (const rib of this.ribs) {
      rib.position.z += speed * dt;
      if (rib.position.z > 9) rib.position.z -= RIB_COUNT * RIB_GAP;
    }
    for (let i = 0; i < this.starPos.length; i += 3) {
      this.starPos[i + 2] += speed * dt * 1.1;
      if (this.starPos[i + 2] > 7) this.starPos[i + 2] = -170;
    }
    (this.stars.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateTrail() {
    this.trailAngles.unshift(this.angle);
    this.trailAngles.pop();
    for (let i = 0; i < TRAIL; i++) {
      const a = this.trailAngles[i];
      this.trailPos[i * 3] = Math.cos(a) * RADIUS;
      this.trailPos[i * 3 + 1] = Math.sin(a) * RADIUS;
      this.trailPos[i * 3 + 2] = 0;
    }
    (this.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private judge(blade: Blade) {
    const gapCenter = blade.group.rotation.z - blade.gapSize / 2;
    const diff = Math.abs(angleDelta(this.angle, gapCenter));
    const half = blade.gapSize / 2 - 0.1;

    if (diff > half) {
      this.die();
      return;
    }

    const perfect = diff < Math.max(0.12, blade.gapSize * 0.16);
    this.gates++;
    const nextLevel = 1 + Math.floor(this.gates / 8);
    if (nextLevel > this.level) {
      this.level = nextLevel;
      this.ui.float(`LEVEL ${this.level}`, window.innerWidth / 2, window.innerHeight * 0.3, 'gold');
      sfx.gold();
    }

    if (perfect) {
      this.combo++;
      const gain = (10 + 5 * this.combo) * this.level;
      this.score += gain;
      this.ui.setScore(this.score, true);
      this.ui.setMid(this.hudText(), (this.gates % 8) / 8);
      this.ui.float(
        `PERFECT +${gain}`,
        window.innerWidth / 2,
        window.innerHeight * 0.34,
      );
      sfx.perfect(this.combo);
      this.particles.spawn(this.orb.position, ACCENT, 16, 3.4);
    } else {
      this.combo = 0;
      this.score += 10 * this.level;
      this.ui.setScore(this.score, true);
      this.ui.setMid(this.hudText(), (this.gates % 8) / 8);
      sfx.gate();
    }
  }

  private hudText() {
    return `LV ${this.level} · ${this.gates} GATE`;
  }

  private die() {
    if (this.mode !== 'play') return;
    this.mode = 'dead';
    this.deadIn = 0.9;
    this.combo = 0;
    this.ui.setMid('');
    this.ui.shake();
    this.ui.flash('#ff4d94');
    sfx.died();
    this.particles.spawn(this.orb.position, DANGER, 46, 8);
    this.particles.spawn(this.orb.position, 0xffffff, 14, 4.5);
    this.orb.visible = false;
  }

  protected onResize(width: number, height: number) {
    const aspect = width / height;
    this.cam.aspect = aspect;
    this.cam.position.z = aspect < 1 ? 10 + (1 - aspect) * 6.5 : 10;
    this.cam.updateProjectionMatrix();
  }
}
