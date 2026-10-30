import * as THREE from 'three';
import { BaseGame, type StageUI } from '../core/stage';
import { sfx } from '../core/audio';
import { clamp, lerp } from '../core/util';

type CubeType = 'normal' | 'gold' | 'bomb';
type Mode = 'idle' | 'play' | 'dead' | 'over';

interface Cube {
  mesh: THREE.Mesh;
  active: boolean;
  type: CubeType;
  slot: number;
  life: number;
  maxLife: number;
  rise: number;
  die: number;
  seed: number;
}

const POOL = 18;
const ROUND_TIME = 30;
const SIZE = 1.32;

export class SmashGame extends BaseGame {
  private cam: THREE.PerspectiveCamera;
  private slots: THREE.Vector3[] = [];
  private cubes: Cube[] = [];
  private mats: Record<CubeType, THREE.MeshStandardMaterial>;
  private cubeGeo = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  private edgeGeo = new THREE.EdgesGeometry(this.cubeGeo);
  private edgeMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.28,
  });

  private mode: Mode = 'idle';
  private timeLeft = ROUND_TIME;
  private elapsed = 0;
  private level = 1;
  private spawnIn = 0.5;
  private combo = 0;
  private deadIn = 0;
  private hudIn = 0;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  constructor(host: HTMLElement, ui: StageUI) {
    super(host, ui);

    this.cam = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
    this.cam.position.set(0, 9, 9);
    this.cam.lookAt(0, 0.6, 0);
    this.camera = this.cam;

    this.mats = {
      normal: new THREE.MeshStandardMaterial({
        color: 0x4ee1ff,
        emissive: 0x0a5d70,
        roughness: 0.28,
        metalness: 0.35,
      }),
      gold: new THREE.MeshStandardMaterial({
        color: 0xffc861,
        emissive: 0x8a5a08,
        roughness: 0.25,
        metalness: 0.5,
      }),
      bomb: new THREE.MeshStandardMaterial({
        color: 0xff4d6d,
        emissive: 0x6e0619,
        roughness: 0.3,
        metalness: 0.4,
      }),
    };

    this.scene.add(new THREE.HemisphereLight(0xa8c4ff, 0x0a0a16, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 12, 7);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4ee1ff, 1.1);
    rim.position.set(-7, 5, -6);
    this.scene.add(rim);

    this.buildBoard();
    this.buildPool();
    this.seedIdle();
    this.bindInput();
    this.mount();
  }

  /* ---------------------------------------------------------------- */

  private buildBoard() {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(6.9, 0.32, 6.9),
      new THREE.MeshStandardMaterial({ color: 0x0b0e1a, roughness: 0.88, metalness: 0.2 }),
    );
    slab.position.y = -0.17;
    this.scene.add(slab);

    const glowEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(6.9, 0.32, 6.9)),
      new THREE.LineBasicMaterial({
        color: 0x4ee1ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glowEdges.position.y = -0.17;
    this.scene.add(glowEdges);

    const padGeo = new THREE.BoxGeometry(1.62, 0.07, 1.62);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x101528,
      emissive: 0x082c36,
      roughness: 0.6,
      metalness: 0.3,
    });
    const padLineMat = new THREE.LineBasicMaterial({
      color: 0x4ee1ff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
    });
    const padEdge = new THREE.EdgesGeometry(padGeo);

    for (let z = -1; z <= 1; z++) {
      for (let x = -1; x <= 1; x++) {
        const pos = new THREE.Vector3(x * 1.95, 0, z * 1.95);
        this.slots.push(pos);
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.copy(pos);
        pad.position.y = 0.01;
        this.scene.add(pad);
        const line = new THREE.LineSegments(padEdge, padLineMat);
        line.position.copy(pad.position);
        this.scene.add(line);
      }
    }

    const grid = new THREE.GridHelper(60, 60, 0x1c3a46, 0x0d1a22);
    grid.position.y = -0.34;
    const gm = grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.45;
    this.scene.add(grid);
  }

  private buildPool() {
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(this.cubeGeo, this.mats.normal);
      mesh.add(new THREE.LineSegments(this.edgeGeo, this.edgeMat));
      mesh.visible = false;
      this.scene.add(mesh);
      this.cubes.push({
        mesh,
        active: false,
        type: 'normal',
        slot: -1,
        life: 0,
        maxLife: 1,
        rise: 0,
        die: 0,
        seed: Math.random() * 10,
      });
    }
  }

  private seedIdle() {
    for (let i = 0; i < 4; i++) {
      const cube = this.cubes[i];
      const slot = i * 2;
      this.activate(cube, slot, 'normal', 9999);
      cube.rise = 1;
      cube.mesh.position.y = 0.72;
    }
  }

  private activate(cube: Cube, slot: number, type: CubeType, life: number) {
    cube.active = true;
    cube.slot = slot;
    cube.type = type;
    cube.life = life;
    cube.maxLife = life;
    cube.rise = 0;
    cube.die = 0;
    cube.mesh.material = this.mats[type];
    cube.mesh.visible = true;
    cube.mesh.scale.setScalar(0.4);
    cube.mesh.rotation.set(0, type === 'bomb' ? Math.PI / 4 : 0, 0);
    cube.mesh.position.copy(this.slots[slot]);
    cube.mesh.position.y = -1.2;
  }

  private bindInput() {
    this.listen<PointerEvent>(this.renderer.domElement, 'pointerdown', (e) => {
      e.preventDefault();
      if (this.mode !== 'play') return;
      this.shoot(e.clientX, e.clientY);
    });
  }

  private shoot(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.ndc, this.cam);

    const meshes = this.cubes.filter((c) => c.active && c.die === 0).map((c) => c.mesh);
    const hits = this.ray.intersectObjects(meshes, false);
    if (!hits.length) {
      this.combo = 0;
      this.ui.setMid(this.timerText(), this.timeLeft / ROUND_TIME);
      this.ui.float('MISS', clientX, clientY, 'bad');
      return;
    }

    const cube = this.cubes.find((c) => c.mesh === hits[0].object);
    if (!cube) return;

    if (cube.type === 'bomb') {
      this.bomb(cube, clientX, clientY);
      return;
    }

    this.combo++;
    const mult = 1 + Math.min(4, Math.floor(this.combo / 4));
    const level = 1 + Math.floor(this.elapsed / 6);
    if (cube.type === 'gold') {
      this.timeLeft = Math.min(45, this.timeLeft + 2);
      this.score += 25 * mult * level;
      this.ui.float('GOLD +2s', clientX, clientY, 'gold');
      this.ui.setMid(this.timerText(), this.timeLeft / ROUND_TIME);
      sfx.gold();
    } else {
      this.score += 10 * mult * level;
      this.ui.float(`+${10 * mult * level}`, clientX, clientY);
      sfx.smash(this.combo);
    }
    if (this.combo > 0 && this.combo % 5 === 0) {
      this.ui.float(`COMBO ×${this.combo}`, window.innerWidth / 2, window.innerHeight * 0.34, 'gold');
    }

    this.ui.setScore(this.score, true);
    this.particles.spawn(cube.mesh.position, cube.type === 'gold' ? 0xffc861 : 0x4ee1ff, 16, 3.6);
    cube.die = 0.16;
    cube.life = 0;
  }

  private bomb(cube: Cube, x: number, y: number) {
    this.combo = 0;
    this.timeLeft = Math.max(0, this.timeLeft - 3);
    this.score = Math.max(0, this.score - 25);
    this.ui.setScore(this.score);
    this.ui.setMid(this.timerText(), this.timeLeft / ROUND_TIME);
    this.ui.float('-3s', x, y, 'bad');
    this.ui.shake();
    this.ui.flash('#ff4d6d');
    sfx.bomb();
    this.particles.spawn(cube.mesh.position, 0xff4d6d, 28, 5);
    cube.die = 0.16;
    cube.life = 0;
  }

  /* ---------------------------------------------------------------- */

  protected reset() {
    for (const cube of this.cubes) {
      cube.active = false;
      cube.mesh.visible = false;
    }
    this.mode = 'play';
    this.timeLeft = ROUND_TIME;
    this.elapsed = 0;
    this.level = 1;
    this.spawnIn = 0.45;
    this.combo = 0;
    this.deadIn = 0;
    this.hudIn = 0;
    this.ui.setMid(this.timerText(), 1);
    sfx.start();
  }

  protected update(dt: number) {
    const t = performance.now() * 0.001;

    if (this.mode === 'play') {
      this.elapsed += dt;
      const nextLevel = 1 + Math.floor(this.elapsed / 6);
      if (nextLevel > this.level) {
        this.level = nextLevel;
        this.ui.float(`LEVEL ${this.level}`, window.innerWidth / 2, window.innerHeight * 0.3, 'gold');
        sfx.gold();
      }
      this.timeLeft -= dt;
      this.spawnIn -= dt;

      if (this.spawnIn <= 0) {
        this.spawn();
        this.spawnIn = Math.max(0.32, 0.8 - this.elapsed * 0.012);
      }

      this.hudIn -= dt;
      if (this.hudIn <= 0) {
        this.hudIn = 0.1;
        this.ui.setMid(this.timerText(), this.timeLeft / ROUND_TIME);
      }

      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.mode = 'dead';
        this.deadIn = 0.55;
        this.ui.setMid('0s', 0);
        sfx.timeUp();
      }
    } else if (this.mode === 'dead') {
      this.deadIn -= dt;
      if (this.deadIn <= 0) {
        this.mode = 'over';
        this.finish();
      }
    }

    for (const cube of this.cubes) {
      if (!cube.active) continue;

      if (cube.die > 0) {
        cube.die -= dt;
        const k = Math.max(0, cube.die / 0.16);
        cube.mesh.scale.setScalar(0.4 + 0.6 * k);
        if (cube.die <= 0) {
          cube.active = false;
          cube.mesh.visible = false;
        }
        continue;
      }

      if (cube.rise < 1) {
        cube.rise = Math.min(1, cube.rise + dt / 0.13);
        const e = 1 - Math.pow(1 - cube.rise, 3);
        cube.mesh.position.y = lerp(-1.2, 0.72, e);
        cube.mesh.scale.setScalar(lerp(0.4, 1, e));
      } else {
        cube.mesh.position.y = 0.72 + Math.sin(t * 3 + cube.seed) * 0.035;
        cube.mesh.rotation.y += dt * (cube.type === 'bomb' ? 1.2 : 0.35);
      }

      if (this.mode === 'play') {
        cube.life -= dt;
        if (cube.life <= 0) {
          this.expire(cube);
          continue;
        }
        if (cube.life < 0.32) {
          cube.mesh.position.y = 0.72 - (0.32 - cube.life) * 3.4;
          cube.mesh.scale.setScalar(Math.max(0.2, cube.life / 0.32));
        }
      }
    }
  }

  private expire(cube: Cube) {
    cube.active = false;
    cube.mesh.visible = false;
    if (this.mode === 'play' && cube.type !== 'bomb') {
      this.combo = 0;
      this.ui.setMid(this.timerText(), this.timeLeft / ROUND_TIME);
    }
  }

  private spawn() {
    const taken = new Set(this.cubes.filter((c) => c.active).map((c) => c.slot));
    const free: number[] = [];
    for (let i = 0; i < 9; i++) if (!taken.has(i)) free.push(i);
    if (!free.length) return;

    const slot = free[Math.floor(this.rng() * free.length)];
    const cube = this.cubes.find((c) => !c.active);
    if (!cube) return;

    const r = this.rng();
    let type: CubeType = 'normal';
    if (this.elapsed > 5 && r < Math.min(0.2, 0.04 + this.elapsed * 0.006)) type = 'bomb';
    else if (r < 0.3) type = 'gold';

    const life = type === 'bomb' ? 1.25 : clamp(1.55 - this.elapsed * 0.014, 0.85, 1.55);
    this.activate(cube, slot, type, life);
  }

  private timerText() {
    return `LV ${this.level} · ${Math.max(0, Math.ceil(this.timeLeft))}s`;
  }

  protected onResize(width: number, height: number) {
    const aspect = width / height;
    this.cam.aspect = aspect;
    const d = aspect < 0.8 ? 13 : 8;
    this.cam.position.set(0, d, d);
    this.cam.lookAt(0, 0.6, 0);
    this.cam.updateProjectionMatrix();
  }
}
