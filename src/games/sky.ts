import * as THREE from 'three';
import { BaseGame, glowSprite, type StageUI } from '../core/stage';
import { sfx } from '../core/audio';
import { clamp, damp, rand } from '../core/util';

type Mode = 'idle' | 'play' | 'dead';
type FoeKind = 'meteor' | 'fighter' | 'bomber';
type PickupType = 'hp' | 'weapon' | 'shield';

const MAX_HP = 5;
const START_HP = 3;
const LEVEL_TIME = 20;
const FOE_POOL = 24;
const SHOT_POOL = 48;
const ENEMY_SHOT_POOL = 44;
const PICKUP_POOL = 6;

const CYAN = 0x9ff6ff;
const ACCENT = 0x38bdf8;
const HOSTILE = 0xff5d7a;
const BOMBER = 0xffa14e;
const ROCK = 0xff7a45;
const HEALTH = 0x7ef2b0;
const WEAPON = 0xffd166;
const SHIELD = 0x4ee1ff;

interface Foe {
  group: THREE.Group;
  meteor: THREE.Mesh;
  edge: THREE.LineSegments;
  fighter: THREE.Group;
  bomber: THREE.Group;
  glow: THREE.Sprite;
  alive: boolean;
  kind: FoeKind;
  hp: number;
  radius: number;
  vx: number;
  vy: number;
  spin: number;
  fireIn: number;
  big: boolean;
}

interface Shot {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
}

interface Pickup {
  group: THREE.Group;
  meshes: Record<PickupType, THREE.Object3D>;
  active: boolean;
  type: PickupType;
}

export class SkyGame extends BaseGame {
  private cam: THREE.OrthographicCamera;
  private halfW = 10;
  private halfH = 9.6;

  private player = new THREE.Group();
  private shieldRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.045, 8, 36),
    new THREE.MeshBasicMaterial({
      color: SHIELD,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  private playerX = 0;
  private playerY = -5;
  private targetX = 0;
  private targetY = -5;

  private foes: Foe[] = [];
  private bullets: Shot[] = [];
  private enemyBullets: Shot[] = [];
  private pickups: Pickup[] = [];
  private stars: THREE.Points;
  private starPos: Float32Array;

  private mode: Mode = 'idle';
  private elapsed = 0;
  private level = 1;
  private hp = START_HP;
  private weapon = 1;
  private shield = 0;
  private invuln = 0;
  private deadIn = 0;
  private spawnIn = 0.6;
  private fireIn = 0;
  private sinceDrop = 0;
  private hudIn = 0;
  private drag: { id: number; x: number; y: number; tx: number; ty: number } | null = null;
  private keys = new Set<string>();

  private meteorGeo = new THREE.IcosahedronGeometry(0.56, 0);
  private meteorEdgeGeo = new THREE.EdgesGeometry(this.meteorGeo);
  private meteorMat = new THREE.MeshStandardMaterial({
    color: 0x4a3340,
    emissive: ROCK,
    emissiveIntensity: 0.32,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  });
  private meteorEdgeMat = new THREE.LineBasicMaterial({
    color: ROCK,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
  });
  private fighterMat = new THREE.MeshStandardMaterial({
    color: HOSTILE,
    emissive: HOSTILE,
    emissiveIntensity: 0.34,
    roughness: 0.4,
    metalness: 0.08,
  });
  private bomberMat = new THREE.MeshStandardMaterial({
    color: BOMBER,
    emissive: BOMBER,
    emissiveIntensity: 0.32,
    roughness: 0.45,
    metalness: 0.08,
  });
  private trimMat = new THREE.MeshBasicMaterial({ color: 0xffe0e6 });
  private bulletGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);
  private bulletMat = new THREE.MeshBasicMaterial({
    color: CYAN,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private shardGeo = new THREE.SphereGeometry(0.16, 8, 8);
  private shardMat = new THREE.MeshBasicMaterial({
    color: 0xff9a6b,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  constructor(host: HTMLElement, ui: StageUI) {
    super(host, ui);

    this.cam = new THREE.OrthographicCamera(-6, 6, 10, -10, 0.1, 60);
    this.cam.position.set(0, 0, 22);
    this.camera = this.cam;

    this.scene.add(new THREE.HemisphereLight(0xa9c6ff, 0x0a0a18, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(4, 9, 10);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(ACCENT, 1.2);
    rim.position.set(-8, 1, -7);
    this.scene.add(rim);

    const haze = glowSprite(ACCENT, 13);
    haze.position.set(-8, 5, -9);
    haze.material.opacity = 0.14;
    this.scene.add(haze);
    const hazeB = glowSprite(0xff7a45, 9);
    hazeB.position.set(8, -4, -8);
    hazeB.material.opacity = 0.1;
    this.scene.add(hazeB);

    this.stars = this.buildStars();
    this.starPos = this.stars.geometry.getAttribute('position').array as Float32Array;
    this.buildPlayer();
    this.buildFoes();
    this.buildShots();
    this.buildPickups();
    this.bindInput();
    this.mount();
  }

  /* ---------------------------------------------------------------- */

  private buildStars() {
    const count = 280;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 2] = -12 + Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xbfe9ff,
        size: 0.08,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(points);
    return points;
  }

  private buildPlayer() {
    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.6, 4),
      new THREE.MeshStandardMaterial({
        color: CYAN,
        emissive: 0x1d8fae,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        metalness: 0.1,
      }),
    );
    hull.rotation.z = Math.PI / 4;

    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.12, 0.2),
      new THREE.MeshStandardMaterial({
        color: 0xd8fbff,
        emissive: 0x2fa9c4,
        emissiveIntensity: 0.5,
        roughness: 0.35,
        metalness: 0.1,
      }),
    );
    wing.position.y = -0.32;

    const tipGeo = new THREE.BoxGeometry(0.62, 0.1, 0.16);
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0x8cedff,
      emissive: 0x2fa9c4,
      emissiveIntensity: 0.45,
      roughness: 0.4,
      metalness: 0.1,
    });
    const tipL = new THREE.Mesh(tipGeo, tipMat);
    tipL.position.set(-0.86, -0.5, 0);
    tipL.rotation.z = 0.5;
    const tipR = new THREE.Mesh(tipGeo, tipMat);
    tipR.position.set(0.86, -0.5, 0);
    tipR.rotation.z = -0.5;

    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.5, 0.16),
      new THREE.MeshStandardMaterial({
        color: 0x9ff6ff,
        emissive: 0x2fa9c4,
        emissiveIntensity: 0.6,
        roughness: 0.35,
        metalness: 0.1,
      }),
    );
    fin.position.set(0, -0.62, 0.05);

    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xeaffff }),
    );
    cockpit.position.set(0, 0.22, 0.22);

    const thrust = glowSprite(CYAN, 2.2);
    thrust.position.set(0, -1.0, -0.2);
    thrust.material.opacity = 0.6;

    this.shieldRing.visible = false;
    this.player.add(hull, wing, tipL, tipR, fin, cockpit, thrust, this.shieldRing);
    this.player.position.set(0, -5, 0);
    this.scene.add(this.player);

    const bodyGlow = glowSprite(0x2ea8c9, 2.6);
    bodyGlow.position.z = -0.6;
    bodyGlow.material.opacity = 0.22;
    this.player.add(bodyGlow);
  }

  private buildFoes() {
    for (let i = 0; i < FOE_POOL; i++) {
      const group = new THREE.Group();

      const meteor = new THREE.Mesh(this.meteorGeo, this.meteorMat);
      const edge = new THREE.LineSegments(this.meteorEdgeGeo, this.meteorEdgeMat);
      meteor.add(edge);

      const fighter = new THREE.Group();
      const fighterBody = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 4), this.fighterMat);
      fighterBody.rotation.z = Math.PI;
      const fighterWing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.18), this.trimMat);
      fighterWing.position.y = 0.18;
      fighter.add(fighterBody, fighterWing);

      const bomber = new THREE.Group();
      const bomberBody = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), this.bomberMat);
      bomberBody.scale.set(1.25, 0.9, 1);
      const bomberWing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.22), this.bomberMat);
      bomber.add(bomberBody, bomberWing);

      const glow = glowSprite(ROCK, 1.9);
      glow.position.z = -0.4;
      glow.material.opacity = 0.35;

      group.add(meteor, fighter, bomber, glow);
      group.visible = false;
      this.scene.add(group);

      this.foes.push({
        group,
        meteor,
        edge,
        fighter,
        bomber,
        glow,
        alive: false,
        kind: 'meteor',
        hp: 1,
        radius: 0.6,
        vx: 0,
        vy: 0,
        spin: 0,
        fireIn: 1,
        big: false,
      });
    }
  }

  private buildShots() {
    for (let i = 0; i < SHOT_POOL; i++) {
      const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.bullets.push({ mesh, active: false, vx: 0, vy: 17 });
    }
    for (let i = 0; i < ENEMY_SHOT_POOL; i++) {
      const mesh = new THREE.Mesh(this.shardGeo, this.shardMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.enemyBullets.push({ mesh, active: false, vx: 0, vy: -5 });
    }
  }

  private buildPickups() {
    const hpMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.4, 0),
      new THREE.MeshStandardMaterial({
        color: HEALTH,
        emissive: HEALTH,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        metalness: 0.05,
      }),
    );
    const weaponMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshStandardMaterial({
        color: WEAPON,
        emissive: WEAPON,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        metalness: 0.05,
      }),
    );
    const shieldMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.12, 10, 22),
      new THREE.MeshStandardMaterial({
        color: SHIELD,
        emissive: SHIELD,
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.05,
      }),
    );

    for (let i = 0; i < PICKUP_POOL; i++) {
      const group = new THREE.Group();
      const ring = glowSprite(WEAPON, 1.9);
      ring.position.z = -0.5;
      ring.material.opacity = 0.42;
      const meshes: Record<PickupType, THREE.Object3D> = {
        hp: hpMesh.clone(),
        weapon: weaponMesh.clone(),
        shield: shieldMesh.clone(),
      };
      group.add(ring, meshes.hp, meshes.weapon, meshes.shield);
      group.visible = false;
      this.scene.add(group);
      this.pickups.push({ group, meshes, active: false, type: 'weapon' });
    }
  }

  /* ---------------------------------------------------------------- */

  private bindInput() {
    const el = this.renderer.domElement;

    this.listen<PointerEvent>(el, 'pointerdown', (e) => {
      if (this.mode !== 'play') return;
      el.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: this.targetX, ty: this.targetY };
    });
    this.listen<PointerEvent>(el, 'pointermove', (e) => {
      if (this.mode !== 'play' || !this.drag || this.drag.id !== e.pointerId) return;
      const rect = el.getBoundingClientRect();
      this.targetX = this.clampX(this.drag.tx + ((e.clientX - this.drag.x) / rect.width) * this.halfW * 2);
      this.targetY = this.clampY(this.drag.ty - ((e.clientY - this.drag.y) / rect.height) * this.halfH * 2);
    });
    const release = (e: PointerEvent) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
    };
    this.listen<PointerEvent>(el, 'pointerup', release);
    this.listen<PointerEvent>(el, 'pointercancel', release);

    this.listen<KeyboardEvent>(window, 'keydown', (e) => {
      if (this.mode !== 'play') return;
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        this.keys.add(e.code);
      }
    });
    this.listen<KeyboardEvent>(window, 'keyup', (e) => this.keys.delete(e.code));
  }

  private clampX(x: number) {
    return clamp(x, -this.halfW + 1.1, this.halfW - 1.1);
  }

  private clampY(y: number) {
    return clamp(y, -this.halfH + 1.3, this.halfH * 0.3);
  }

  /* ---------------------------------------------------------------- */

  protected reset() {
    this.mode = 'play';
    this.elapsed = 0;
    this.level = 1;
    this.hp = START_HP;
    this.weapon = 1;
    this.shield = 0;
    this.invuln = 0;
    this.deadIn = 0;
    this.spawnIn = 0.5;
    this.fireIn = 0.2;
    this.sinceDrop = 0;
    this.hudIn = 0;
    this.drag = null;
    this.keys.clear();

    this.playerX = this.targetX = 0;
    this.playerY = this.targetY = -this.halfH * 0.55;
    this.player.position.set(0, this.playerY, 0);
    this.player.visible = true;
    this.shieldRing.visible = false;

    for (const foe of this.foes) this.deactivate(foe);
    for (const shot of [...this.bullets, ...this.enemyBullets]) {
      shot.active = false;
      shot.mesh.visible = false;
    }
    for (const pickup of this.pickups) {
      pickup.active = false;
      pickup.group.visible = false;
    }

    this.updateHud();
    sfx.start();
  }

  protected update(dt: number) {
    const t = performance.now() * 0.001;

    if (this.mode === 'idle') {
      this.player.position.y = this.playerY + Math.sin(t * 1.6) * 0.14;
      this.animateStars(dt, 2.4);
      return;
    }

    if (this.mode === 'play') {
      this.elapsed += dt;
      const nextLevel = 1 + Math.floor(this.elapsed / LEVEL_TIME);
      if (nextLevel !== this.level) {
        this.level = nextLevel;
        this.ui.float(`LEVEL ${this.level}`, window.innerWidth / 2, window.innerHeight * 0.34, 'gold');
        sfx.gold();
      }

      this.movePlayer(dt);

      this.shield = Math.max(0, this.shield - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.player.visible = this.invuln <= 0 || Math.floor(t * 14) % 2 === 0;
      this.shieldRing.visible = this.shield > 0;
      this.shieldRing.rotation.z += dt * 1.6;
      this.shieldRing.material.opacity = 0.45 + Math.sin(t * 8) * 0.2;

      this.fireIn -= dt;
      if (this.fireIn <= 0) {
        this.fireIn = Math.max(0.12, 0.24 - (this.weapon - 1) * 0.035);
        this.shoot();
      }

      this.spawnIn -= dt;
      if (this.spawnIn <= 0) this.spawnFoe();

      this.updateFoes(dt);
      this.updateBullets(dt);
      this.updatePickups(dt);
      this.animateStars(dt, 3.2 + this.level * 0.5);

      this.hudIn -= dt;
      if (this.hudIn <= 0) {
        this.hudIn = 0.1;
        this.updateHud();
      }
    } else if (this.mode === 'dead') {
      this.deadIn -= dt;
      this.animateStars(dt, 1.1);
      if (this.deadIn <= 0) {
        this.mode = 'idle';
        this.finish();
      }
    }
  }

  private movePlayer(dt: number) {
    const kbX =
      (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) -
      (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
    const kbY =
      (this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0) -
      (this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0);
    if (kbX) this.targetX += kbX * 11 * dt;
    if (kbY) this.targetY += kbY * 11 * dt;
    this.targetX = this.clampX(this.targetX);
    this.targetY = this.clampY(this.targetY);

    const prevX = this.playerX;
    this.playerX = damp(this.playerX, this.targetX, 16, dt);
    this.playerY = damp(this.playerY, this.targetY, 16, dt);
    this.player.position.set(this.playerX, this.playerY, 0);
    this.player.rotation.z = clamp((this.playerX - prevX) * 0.9, -0.32, 0.32);
  }

  private hudText() {
    return `LV ${this.level} · ${this.hp}/${MAX_HP} · W${this.weapon}`;
  }

  private updateHud() {
    this.ui.setMid(this.hudText(), (this.elapsed % LEVEL_TIME) / LEVEL_TIME);
  }

  /* ---------------------------------------------------------------- */

  private spawnFoe() {
    const level = this.level;
    this.spawnIn = Math.max(0.28, 0.86 - (level - 1) * 0.055) * rand(0.72, 1.2, this.rng);

    const foe = this.foes.find((f) => !f.alive);
    if (!foe) return;
    const roll = this.rng();
    const kind: FoeKind = roll < 0.5 ? 'meteor' : roll < 0.87 ? 'fighter' : 'bomber';

    foe.alive = true;
    foe.kind = kind;
    foe.big = kind === 'meteor' && this.rng() < 0.22;
    foe.fireIn = rand(0.7, 1.8, this.rng);
    foe.spin = rand(-1.6, 1.6, this.rng);
    foe.group.position.set(rand(-this.halfW + 1.4, this.halfW - 1.4, this.rng), this.halfH + 1.6, 0);
    foe.group.rotation.set(0, 0, 0);
    foe.group.visible = true;

    foe.meteor.visible = kind === 'meteor';
    foe.fighter.visible = kind === 'fighter';
    foe.bomber.visible = kind === 'bomber';
    foe.glow.material.color.set(kind === 'meteor' ? ROCK : kind === 'fighter' ? HOSTILE : BOMBER);

    if (kind === 'meteor') {
      foe.hp = foe.big ? 3 : 1;
      foe.radius = foe.big ? 0.95 : 0.6;
      foe.vy = rand(2.1, 2.9, this.rng) + level * 0.16;
      foe.vx = rand(-1.0, 1.0, this.rng);
      foe.meteor.scale.setScalar(foe.big ? 1.6 : 1);
      foe.meteor.rotation.set(this.rng() * 3, this.rng() * 3, 0);
    } else if (kind === 'fighter') {
      foe.hp = 1;
      foe.radius = 0.6;
      foe.vy = 1.7 + level * 0.1;
      foe.vx = (this.playerX - foe.group.position.x) * 0.18;
    } else {
      foe.hp = 4 + Math.floor(level * 0.5);
      foe.radius = 0.85;
      foe.vy = 1.1 + level * 0.05;
      foe.vx = 0;
    }
  }

  private updateFoes(dt: number) {
    const minY = -this.halfH - 2.5;
    for (const foe of this.foes) {
      if (!foe.alive) continue;
      foe.group.position.x += foe.vx * dt;
      foe.group.position.y -= foe.vy * dt;

      if (foe.kind === 'meteor') {
        foe.meteor.rotation.x += foe.spin * dt;
        foe.meteor.rotation.y += foe.spin * 0.8 * dt;
      } else if (foe.kind === 'fighter') {
        foe.fighter.rotation.z = Math.sin(foe.group.position.y * 0.6) * 0.12;
        foe.fireIn -= dt;
        if (foe.fireIn <= 0) {
          foe.fireIn = Math.max(0.55, 1.5 - this.level * 0.07);
          this.fireEnemy(foe);
        }
      } else {
        foe.bomber.rotation.z += dt * 0.4;
        foe.fireIn -= dt;
        if (foe.fireIn <= 0) {
          foe.fireIn = Math.max(1.2, 2.4 - this.level * 0.08);
          this.fireEnemy(foe);
          this.fireEnemy(foe, 0.35);
        }
      }

      if (foe.group.position.x < -this.halfW - 2 || foe.group.position.x > this.halfW + 2) {
        this.deactivate(foe);
        continue;
      }
      if (foe.group.position.y < minY) {
        this.deactivate(foe);
        continue;
      }

      const dx = foe.group.position.x - this.playerX;
      const dy = foe.group.position.y - this.playerY;
      if (dx * dx + dy * dy < (foe.radius + 0.5) ** 2) {
        this.particles.spawn(foe.group.position, ROCK, 14, 4);
        this.deactivate(foe);
        this.hitPlayer();
        if (this.mode !== 'play') return;
      }
    }
  }

  private fireEnemy(foe: Foe, spread = 0) {
    const shot = this.enemyBullets.find((s) => !s.active);
    if (!shot) return;
    const dx = this.playerX - foe.group.position.x;
    const dy = this.playerY - foe.group.position.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 4 + this.level * 0.28;
    shot.active = true;
    shot.mesh.visible = true;
    shot.mesh.position.copy(foe.group.position);
    shot.vx = (dx / len) * speed + spread * speed;
    shot.vy = (dy / len) * speed;
  }

  private shoot() {
    const y = this.playerY + 1.05;
    const offsets = this.weapon === 1 ? [{ x: 0, vx: 0 }] : this.weapon === 2 ? [
      { x: -0.34, vx: 0 },
      { x: 0.34, vx: 0 },
    ] : [
      { x: 0, vx: 0 },
      { x: -0.42, vx: -2.4 },
      { x: 0.42, vx: 2.4 },
    ];
    for (const o of offsets) {
      const shot = this.bullets.find((s) => !s.active);
      if (!shot) break;
      shot.active = true;
      shot.mesh.visible = true;
      shot.mesh.position.set(this.playerX + o.x, y, 0);
      shot.vx = o.vx;
      shot.vy = 17;
    }
    sfx.laser();
  }

  private updateBullets(dt: number) {
    for (const shot of this.bullets) {
      if (!shot.active) continue;
      shot.mesh.position.x += shot.vx * dt;
      shot.mesh.position.y += shot.vy * dt;
      if (shot.mesh.position.y > this.halfH + 1.5) {
        shot.active = false;
        shot.mesh.visible = false;
        continue;
      }
      for (const foe of this.foes) {
        if (!foe.alive) continue;
        const dx = shot.mesh.position.x - foe.group.position.x;
        const dy = shot.mesh.position.y - foe.group.position.y;
        if (dx * dx + dy * dy > (foe.radius + 0.18) ** 2) continue;

        foe.hp -= 1;
        shot.active = false;
        shot.mesh.visible = false;
        this.particles.spawn(shot.mesh.position, 0xd8fbff, 4, 3, 0.1);
        if (foe.hp <= 0) this.killFoe(foe);
        break;
      }
    }

    for (const shot of this.enemyBullets) {
      if (!shot.active) continue;
      shot.mesh.position.x += shot.vx * dt;
      shot.mesh.position.y += shot.vy * dt;
      if (shot.mesh.position.y < -this.halfH - 2 || Math.abs(shot.mesh.position.x) > this.halfW + 2) {
        shot.active = false;
        shot.mesh.visible = false;
        continue;
      }
      const dx = shot.mesh.position.x - this.playerX;
      const dy = shot.mesh.position.y - this.playerY;
      if (dx * dx + dy * dy < 0.45) {
        shot.active = false;
        shot.mesh.visible = false;
        this.hitPlayer();
        if (this.mode !== 'play') return;
      }
    }
  }

  private killFoe(foe: Foe) {
    const base = foe.kind === 'meteor' ? (foe.big ? 22 : 10) : foe.kind === 'fighter' ? 16 : 38;
    const value = base * this.level;
    this.score += value;
    this.ui.setScore(this.score, true);

    const color = foe.kind === 'meteor' ? ROCK : foe.kind === 'fighter' ? HOSTILE : BOMBER;
    this.particles.spawn(foe.group.position, color, foe.kind === 'bomber' ? 26 : 16, 5);
    if (foe.kind === 'bomber') sfx.bomb();
    else sfx.smash(2);

    const drop = this.rng() < 0.16 || this.sinceDrop >= 9;
    if (drop) {
      this.sinceDrop = 0;
      this.spawnPickup(foe.group.position);
    } else {
      this.sinceDrop++;
    }

    this.deactivate(foe);
  }

  private deactivate(foe: Foe) {
    foe.alive = false;
    foe.group.visible = false;
  }

  /* ---------------------------------------------------------------- */

  private spawnPickup(at: THREE.Vector3) {
    const pickup = this.pickups.find((p) => !p.active);
    if (!pickup) return;
    pickup.active = true;
    pickup.group.visible = true;
    pickup.group.position.set(clamp(at.x, -this.halfW + 1, this.halfW - 1), at.y, 0.2);

    const roll = this.rng();
    pickup.type = roll < 0.34 ? 'hp' : roll < 0.72 ? 'weapon' : 'shield';
    for (const type of PICKUP_TYPES) pickup.meshes[type].visible = type === pickup.type;

    const color = pickup.type === 'hp' ? HEALTH : pickup.type === 'weapon' ? WEAPON : SHIELD;
    const halo = pickup.group.children[0] as THREE.Sprite;
    halo.material.color.set(color);
  }

  private updatePickups(dt: number) {
    const t = performance.now() * 0.001;
    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      pickup.group.position.y -= (1.35 + this.level * 0.05) * dt;
      pickup.group.rotation.y += dt * 2.2;
      pickup.group.rotation.x = Math.sin(t * 2 + pickup.group.position.x) * 0.25;
      pickup.group.position.x += Math.sin(t * 1.6 + pickup.group.position.y) * dt * 0.5;

      if (pickup.group.position.y < -this.halfH - 2) {
        pickup.active = false;
        pickup.group.visible = false;
        continue;
      }

      const dx = pickup.group.position.x - this.playerX;
      const dy = pickup.group.position.y - this.playerY;
      if (dx * dx + dy * dy > 0.85) continue;

      this.collect(pickup);
    }
  }

  private collect(pickup: Pickup) {
    pickup.active = false;
    pickup.group.visible = false;
    this.particles.spawn(pickup.group.position, pickup.type === 'hp' ? HEALTH : pickup.type === 'weapon' ? WEAPON : SHIELD, 18, 4);
    sfx.gold();

    const sx = ((pickup.group.position.x / this.halfW + 1) / 2) * window.innerWidth;
    const sy = ((1 - pickup.group.position.y / this.halfH) / 2) * window.innerHeight;

    if (pickup.type === 'hp') {
      if (this.hp < MAX_HP) {
        this.hp++;
        this.ui.float('+1 DARAH', sx, sy);
      } else {
        const bonus = 250 * this.level;
        this.score += bonus;
        this.ui.setScore(this.score, true);
        this.ui.float(`DARAH PENUH +${bonus}`, sx, sy, 'gold');
      }
    } else if (pickup.type === 'weapon') {
      if (this.weapon < 3) {
        this.weapon++;
        this.ui.float(`SENJATA W${this.weapon}`, sx, sy);
      } else {
        const bonus = 200 * this.level;
        this.score += bonus;
        this.ui.setScore(this.score, true);
        this.ui.float(`SENJATA MAKS +${bonus}`, sx, sy, 'gold');
      }
    } else {
      this.shield = 7;
      this.ui.float('PERISAI 7s', sx, sy);
    }
    this.updateHud();
  }

  /* ---------------------------------------------------------------- */

  private hitPlayer() {
    if (this.mode !== 'play' || this.invuln > 0) return;
    if (this.shield > 0) {
      this.particles.spawn(this.player.position, SHIELD, 22, 5);
      this.ui.shake(0.8);
      return;
    }

    this.hp--;
    this.invuln = 1.7;
    this.ui.shake();
    this.ui.flash('#ff5d7a');
    this.particles.spawn(this.player.position, CYAN, 26, 5);
    this.particles.spawn(this.player.position, 0xffffff, 12, 3);
    this.ui.float('-1 DARAH', window.innerWidth / 2, window.innerHeight * 0.6, 'bad');
    sfx.died();
    this.updateHud();

    for (const shot of this.enemyBullets) {
      shot.active = false;
      shot.mesh.visible = false;
    }

    if (this.hp <= 0) this.end();
  }

  private end() {
    if (this.mode !== 'play') return;
    this.mode = 'dead';
    this.deadIn = 0.9;
    this.shield = 0;
    this.shieldRing.visible = false;
    this.ui.setMid('');
    this.player.visible = true;
    this.particles.spawn(this.player.position, CYAN, 34, 6);
    this.particles.spawn(this.player.position, 0xffd166, 18, 5);
  }

  private animateStars(dt: number, speed: number) {
    for (let i = 0; i < this.starPos.length; i += 3) {
      this.starPos[i + 1] -= speed * dt;
      if (this.starPos[i + 1] < -12) this.starPos[i + 1] = 12;
    }
    (this.stars.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  protected onResize(width: number, height: number) {
    const aspect = width / height;
    const halfH = aspect < 0.8 ? 10.6 : 9.6;
    this.halfH = halfH;
    this.halfW = halfH * aspect;
    this.cam.left = -this.halfW;
    this.cam.right = this.halfW;
    this.cam.top = halfH;
    this.cam.bottom = -halfH;
    this.cam.updateProjectionMatrix();
    this.targetX = this.clampX(this.targetX);
    this.targetY = this.clampY(this.targetY);
  }
}

const MOVE_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
]);

const PICKUP_TYPES: PickupType[] = ['hp', 'weapon', 'shield'];
