import * as THREE from 'three';
import { BaseGame, type StageUI } from '../core/stage';
import { sfx } from '../core/audio';
import { clamp, damp, rand } from '../core/util';

const H = 0.62;
const PALETTE = ['#6ee7ff', '#a78bfa', '#f472b6', '#fbbf24', '#86efac', '#60a5fa'];

interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
}

export class StackGame extends BaseGame {
  private cam: THREE.OrthographicCamera;
  private camY = 0;
  private baseHalfW = 7.2;
  private baseHalfH = 4.6;
  private zoom = 1;
  private halfH = 4.6;

  private prev: Footprint = { x: 0, z: 0, w: 3.4, d: 3.4 };
  private placed: THREE.Mesh[] = [];
  private moving: THREE.Mesh | null = null;
  private falling: { mesh: THREE.Mesh; vy: number } | null = null;
  private axis: 'x' | 'z' = 'x';
  private dir = 1;
  private offset = 0;
  private amp = 4;
  private moveSpeed = 2.6;
  private topY = H / 2;
  private count = 1;
  private level = 1;
  private combo = 0;
  private mode: 'idle' | 'play' | 'dead' | 'over' = 'idle';
  private deadIn = 0;
  private dust: THREE.Points;
  private dustPos: Float32Array;

  private boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private edgeGeo = new THREE.EdgesGeometry(this.boxGeo);
  private edgeMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16,
  });

  constructor(host: HTMLElement, ui: StageUI) {
    super(host, ui);

    this.cam = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 120);
    this.cam.position.set(8, 10, 8);
    this.cam.lookAt(0, 0, 0);
    this.camera = this.cam;

    this.scene.add(new THREE.HemisphereLight(0x9db8ff, 0x0a0a18, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(6, 14, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xff7bcb, 0.9);
    fill.position.set(-8, 4, -6);
    this.scene.add(fill);

    this.buildStage();
    const dust = this.buildDust();
    this.dust = dust.points;
    this.dustPos = dust.positions;

    this.buildIdleBase();
    this.bindInput();
    this.mount();
  }

  /* ---------------------------------------------------------------- */

  private buildStage() {
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.8, 0.28, 48),
      new THREE.MeshStandardMaterial({ color: 0x0d1020, roughness: 0.9, metalness: 0.1 }),
    );
    platform.position.y = -0.62;
    this.scene.add(platform);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.62, 0.018, 4, 96),
      new THREE.MeshBasicMaterial({
        color: 0xa78bfa,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.47;
    this.scene.add(ring);

    const grid = new THREE.GridHelper(50, 50, 0x2a2f52, 0x161a2c);
    grid.position.y = -0.78;
    const gm = grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.55;
    this.scene.add(grid);
  }

  private buildDust() {
    const count = 90;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = rand(-7, 7);
      positions[i * 3 + 1] = rand(-0.5, 16);
      positions[i * 3 + 2] = rand(-7, 7);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xb9a6ff,
        size: 0.055,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(points);
    return { points, positions };
  }

  private makeBlock(w: number, d: number, colorHex: string): THREE.Mesh {
    const color = new THREE.Color(colorHex);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.36,
      metalness: 0.12,
      emissive: color.clone().multiplyScalar(0.16),
    });
    const mesh = new THREE.Mesh(this.boxGeo, mat);
    mesh.scale.set(w, H, d);
    mesh.add(new THREE.LineSegments(this.edgeGeo, this.edgeMat));
    return mesh;
  }

  private addBase(size: number) {
    const base = this.makeBlock(size, size, PALETTE[0]);
    base.position.set(0, H / 2, 0);
    this.scene.add(base);
    this.placed.push(base);
  }

  private buildIdleBase() {
    this.addBase(3.4);
    const ring = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.02, 3.4),
      new THREE.MeshBasicMaterial({
        color: 0xa78bfa,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.position.y = H + 0.02;
    this.scene.add(ring);
    this.placed.push(ring);
  }

  private clearBlocks() {
    const meshes = [...this.placed];
    if (this.moving) meshes.push(this.moving);
    if (this.falling) meshes.push(this.falling.mesh);
    for (const mesh of meshes) {
      this.scene.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    this.placed = [];
    this.moving = null;
    this.falling = null;
  }

  private baseSize() {
    return clamp(this.baseHalfW * 0.62, 2.7, 4.4);
  }

  private spawnMoving() {
    const color = PALETTE[this.count % PALETTE.length];
    const mesh = this.makeBlock(this.prev.w, this.prev.d, color);
    mesh.position.set(this.prev.x, this.topY + H / 2, this.prev.z);
    this.scene.add(mesh);
    this.moving = mesh;

    this.axis = this.count % 2 === 1 ? 'x' : 'z';
    this.amp = clamp(this.baseSize() * 1.05 + 0.5, 3.4, 6.2);
    this.offset = -this.amp * 0.55;
    this.dir = 1;
    this.moveSpeed = 2.6 + Math.min(2.8, this.count * 0.085);
    this.syncMoving();
  }

  private syncMoving() {
    if (!this.moving) return;
    this.moving.position.set(
      this.prev.x + (this.axis === 'x' ? this.offset : 0),
      this.topY + H / 2,
      this.prev.z + (this.axis === 'z' ? this.offset : 0),
    );
  }

  /* ---------------------------------------------------------------- */

  protected reset() {
    this.clearBlocks();
    this.mode = 'play';
    this.score = 0;
    this.combo = 0;
    this.count = 1;
    this.level = 1;
    this.zoom = 1;
    this.deadIn = 0;

    const size = this.baseSize();
    this.prev = { x: 0, z: 0, w: size, d: size };
    this.topY = H / 2;
    this.addBase(size);
    this.applyFrustum();
    this.camY = this.topY - this.halfH * 0.32;
    this.cam.position.set(8, this.camY + 10, 8);
    this.cam.lookAt(0, this.camY, 0);

    this.spawnMoving();
    this.ui.setMid(this.hudText(), 0);
    sfx.start();
  }

  protected update(dt: number) {
    const t = performance.now() * 0.001;

    if (this.mode === 'idle') {
      const a = t * 0.16;
      this.cam.position.set(Math.cos(a) * 10, 10 + Math.sin(t * 0.6) * 0.4, Math.sin(a) * 10);
      this.cam.lookAt(0, 0, 0);
      this.animateDust(dt);
      return;
    }

    if (this.mode === 'play' && this.moving) {
      this.offset += this.dir * this.moveSpeed * dt;
      if (Math.abs(this.offset) > this.amp) {
        this.offset = clamp(this.offset, -this.amp, this.amp);
        this.dir *= -1;
      }
      this.syncMoving();
    }

    if (this.falling) {
      this.falling.vy -= 32 * dt;
      this.falling.mesh.position.y += this.falling.vy * dt;
      this.falling.mesh.rotation.x += dt * 2.2;
      this.falling.mesh.rotation.z += dt * 1.4;
      if (this.falling.mesh.position.y < -20) {
        this.scene.remove(this.falling.mesh);
        (this.falling.mesh.material as THREE.Material).dispose();
        this.falling = null;
      }
    }

    if (this.mode === 'dead') {
      this.deadIn -= dt;
      if (this.deadIn <= 0) {
        this.mode = 'over';
        this.finish();
      }
    }

    const targetY = this.topY - this.halfH * 0.32;
    this.camY = damp(this.camY, targetY, 4.5, dt);
    this.cam.position.set(8, this.camY + 10, 8);
    this.cam.lookAt(0, this.camY, 0);

    this.animateDust(dt);
  }

  private animateDust(dt: number) {
    for (let i = 1; i < this.dustPos.length; i += 3) {
      this.dustPos[i] += dt * 0.22;
      if (this.dustPos[i] > 16) this.dustPos[i] = -0.5;
    }
    (this.dust.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private drop() {
    if (this.mode !== 'play' || !this.moving) return;
    const mesh = this.moving;
    this.moving = null;

    const delta = this.offset;
    const axis = this.axis;
    const footprint = axis === 'x' ? this.prev.w : this.prev.d;
    const overlap = footprint - Math.abs(delta);
    const color = PALETTE[this.count % PALETTE.length];

    if (overlap <= 0.12) {
      this.mode = 'dead';
      this.deadIn = 1.05;
      this.combo = 0;
      this.ui.setMid('');
      this.ui.shake();
      this.ui.flash('#a78bfa');
      sfx.died();
      this.falling = { mesh, vy: 2 };
      this.particles.spawn(mesh.position, color, 30, 5);
      return;
    }

    const perfect = Math.abs(delta) < 0.13;
    const placedColor = new THREE.Color(color);

    if (perfect) {
      this.combo++;
      mesh.position.set(this.prev.x, this.topY + H / 2, this.prev.z);
      this.score += (10 + this.combo * 5) * this.level;
      this.ui.float(
        `PERFECT ×${this.combo}`,
        window.innerWidth / 2,
        window.innerHeight * 0.36,
      );
      sfx.perfect(this.combo);
      this.particles.spawn(mesh.position, placedColor, 20, 3.4);
    } else {
      const newFoot = overlap;
      if (axis === 'x') {
        this.prev.x += delta / 2;
        this.prev.w = newFoot;
        mesh.position.x = this.prev.x;
        mesh.scale.x = newFoot;
      } else {
        this.prev.z += delta / 2;
        this.prev.d = newFoot;
        mesh.position.z = this.prev.z;
        mesh.scale.z = newFoot;
      }
      this.combo = 0;
      this.score += 10 * this.level;
      sfx.cut();
      const edge = mesh.position.clone();
      edge[axis] += Math.sign(delta || 1) * (newFoot / 2);
      this.particles.spawn(edge, 0xffffff, 9, 2.6, 0.3);
    }

    mesh.position.y = this.topY + H / 2;
    this.ui.setScore(this.score, true);
    this.placed.push(mesh);

    this.count++;
    const nextLevel = 1 + Math.floor((this.count - 1) / 6);
    if (nextLevel > this.level) {
      this.level = nextLevel;
      this.ui.float(`LEVEL ${this.level}`, window.innerWidth / 2, window.innerHeight * 0.3, 'gold');
      sfx.gold();
    }
    this.ui.setMid(this.hudText(), ((this.count - 1) % 6) / 6);
    this.topY += H;
    this.zoom = Math.min(1.28, 1 + this.count * 0.006);
    this.applyFrustum();
    this.spawnMoving();
    sfx.place();
  }

  private hudText() {
    return `LV ${this.level} · ${this.count - 1} BLOK`;
  }

  private bindInput() {
    this.listen<PointerEvent>(this.renderer.domElement, 'pointerdown', (e) => {
      e.preventDefault();
      this.drop();
    });
    this.listen<KeyboardEvent>(window, 'keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown') {
        e.preventDefault();
        this.drop();
      }
    });
  }

  protected onResize(width: number, height: number) {
    const aspect = width / height;
    this.baseHalfW = aspect < 0.85 ? 3.6 : 7.2;
    this.baseHalfH = this.baseHalfW / aspect;
    this.halfH = this.baseHalfH;
    this.applyFrustum();
  }

  private applyFrustum() {
    const halfW = this.baseHalfW * this.zoom;
    this.halfH = this.baseHalfH * this.zoom;
    this.cam.left = -halfW;
    this.cam.right = halfW;
    this.cam.top = this.halfH;
    this.cam.bottom = -this.halfH;
    this.cam.updateProjectionMatrix();
  }
}
