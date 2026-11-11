import * as THREE from 'three';
import { BaseGame, glowSprite, type StageUI } from '../core/stage';
import { sfx } from '../core/audio';
import { clamp, damp, rand } from '../core/util';

type Mode = 'idle' | 'play' | 'dead';
type Phase = 'wave' | 'boss';
type FoeKind = 'meteor' | 'fighter' | 'bomber' | 'darter' | 'turret';
type BossKind = 'meteor' | 'carrier' | 'fortress' | 'void';
type PickupType = 'hp' | 'weapon' | 'shield';

const MAX_HP = 5;
const START_HP = 3;
const MAX_WEAPON = 5;
const WAVE_TIME = 16;
const FOE_POOL = 30;
const SHOT_POOL = 96;
const ENEMY_SHOT_POOL = 110;
const PICKUP_POOL = 6;

const CYAN = 0x9ff6ff;
const ACCENT = 0x38bdf8;
const HOSTILE = 0xff5d7a;
const BOMBER = 0xffa14e;
const ROCK = 0xff7a45;
const HEALTH = 0x7ef2b0;
const WEAPON = 0xffd166;
const SHIELD = 0x4ee1ff;
const VIOLET = 0xa78bfa;

const BOSS_KINDS: BossKind[] = ['meteor', 'carrier', 'fortress', 'void'];
const BOSS_NAMES: Record<BossKind, string> = {
  meteor: 'RAJA METEOR',
  carrier: 'RAJA SAYAP',
  fortress: 'RAJA BOMBARDIR',
  void: 'RAJA VOID',
};
const BOSS_COLORS: Record<BossKind, number> = {
  meteor: ROCK,
  carrier: HOSTILE,
  fortress: BOMBER,
  void: VIOLET,
};
const FOE_COLORS: Record<FoeKind, number> = {
  meteor: ROCK,
  fighter: HOSTILE,
  bomber: BOMBER,
  darter: HEALTH,
  turret: VIOLET,
};
const RANKS = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

interface Foe {
  group: THREE.Group;
  meteor: THREE.Mesh;
  edge: THREE.LineSegments;
  fighter: THREE.Group;
  bomber: THREE.Group;
  darter: THREE.Group;
  turret: THREE.Group;
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

interface Boss {
  group: THREE.Group;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  wings: THREE.Group;
  spikes: THREE.Group;
  glow: THREE.Sprite;
  alive: boolean;
  kind: BossKind;
  name: string;
  hp: number;
  maxHp: number;
  radius: number;
  entering: boolean;
  attackIn: number;
  spawnIn: number;
  spiral: number;
}

interface Shot {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  pierce: number;
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
    new THREE.TorusGeometry(1.35, 0.05, 8, 40),
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
  private phase: Phase = 'wave';
  private elapsed = 0;
  private waveClock = 0;
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
  private bossWarned = false;
  private boss!: Boss;
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
  private darterMat = new THREE.MeshStandardMaterial({
    color: HEALTH,
    emissive: HEALTH,
    emissiveIntensity: 0.4,
    roughness: 0.4,
    metalness: 0.08,
  });
  private turretMat = new THREE.MeshStandardMaterial({
    color: VIOLET,
    emissive: VIOLET,
    emissiveIntensity: 0.35,
    roughness: 0.5,
    metalness: 0.1,
  });
  private turretRingMat = new THREE.MeshBasicMaterial({
    color: VIOLET,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private bossMat = new THREE.MeshStandardMaterial({
    color: ROCK,
    emissive: ROCK,
    emissiveIntensity: 0.4,
    roughness: 0.38,
    metalness: 0.15,
    flatShading: true,
  });
  private bossRingMat = new THREE.MeshBasicMaterial({
    color: ROCK,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
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
    this.buildBoss();
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
    // Top-down jet silhouette: nose, swept wings, tail boom.
    const outline: Array<[number, number]> = [
      [0, 1.7],
      [0.13, 1.05],
      [0.26, 0.68],
      [0.38, 0.5],
      [1.15, -0.12],
      [1.28, -0.32],
      [1.16, -0.5],
      [0.44, -0.62],
      [0.4, -1.15],
      [0.16, -1.3],
      [0, -1.32],
    ];
    const shape = new THREE.Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
    for (let i = outline.length - 2; i > 0; i--) shape.lineTo(-outline[i][0], outline[i][1]);
    shape.closePath();

    const hullGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.03,
      bevelSegments: 1,
      curveSegments: 1,
    });
    hullGeo.translate(0, 0, -0.11);

    const hull = new THREE.Mesh(
      hullGeo,
      new THREE.MeshStandardMaterial({
        color: 0xa9f0ff,
        emissive: 0x1f9fc0,
        emissiveIntensity: 0.5,
        roughness: 0.36,
        metalness: 0.12,
      }),
    );

    const outlineMesh = new THREE.LineSegments(
      new THREE.EdgesGeometry(hullGeo, 24),
      new THREE.LineBasicMaterial({
        color: 0xe8fdff,
        transparent: true,
        opacity: 0.55,
      }),
    );

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0xf2feff,
        emissive: 0x8fe7ff,
        emissiveIntensity: 0.5,
        roughness: 0.25,
        metalness: 0.1,
      }),
    );
    canopy.scale.set(0.62, 1.7, 0.5);
    canopy.position.set(0, 0.5, 0.16);

    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.5, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0xd6f7ff,
        emissive: 0x3fb6d4,
        emissiveIntensity: 0.45,
        roughness: 0.4,
        metalness: 0.08,
      }),
    );
    spine.position.set(0, -0.42, 0.14);

    const podGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8);
    podGeo.rotateX(Math.PI / 2);
    const podMat = new THREE.MeshStandardMaterial({
      color: 0xe4fbff,
      emissive: 0x2fa9c4,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.1,
    });
    const podL = new THREE.Mesh(podGeo, podMat);
    podL.position.set(-0.86, -0.32, 0.02);
    const podR = new THREE.Mesh(podGeo, podMat);
    podR.position.set(0.86, -0.32, 0.02);

    const finGeo = new THREE.BoxGeometry(0.07, 0.56, 0.22);
    const finMat = new THREE.MeshStandardMaterial({
      color: 0xd8fbff,
      emissive: 0x2fa9c4,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.1,
    });
    const finL = new THREE.Mesh(finGeo, finMat);
    finL.position.set(-0.22, -0.86, 0.06);
    finL.rotation.z = 0.2;
    const finR = new THREE.Mesh(finGeo, finMat);
    finR.position.set(0.22, -0.86, 0.06);
    finR.rotation.z = -0.2;

    const lightGeo = new THREE.SphereGeometry(0.07, 8, 8);
    const port = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff5d7a }));
    port.position.set(-1.2, -0.34, 0.08);
    const starboard = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x7ef2b0 }));
    starboard.position.set(1.2, -0.34, 0.08);

    const nozzleGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.18, 10);
    nozzleGeo.rotateX(Math.PI / 2);
    const nozzleMat = new THREE.MeshBasicMaterial({ color: 0x0d3a46 });
    const nozzleL = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzleL.position.set(-0.16, -1.28, 0);
    const nozzleR = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzleR.position.set(0.16, -1.28, 0);

    const exhaustL = glowSprite(0xbdf6ff, 1.5);
    exhaustL.position.set(-0.18, -1.58, -0.15);
    exhaustL.material.opacity = 0.7;
    const exhaustR = glowSprite(0xbdf6ff, 1.5);
    exhaustR.position.set(0.18, -1.58, -0.15);
    exhaustR.material.opacity = 0.7;
    const thrust = glowSprite(CYAN, 3.2);
    thrust.position.set(0, -1.85, -0.4);
    thrust.material.opacity = 0.28;

    this.shieldRing.visible = false;
    this.player.add(
      hull,
      outlineMesh,
      canopy,
      spine,
      podL,
      podR,
      finL,
      finR,
      port,
      starboard,
      nozzleL,
      nozzleR,
      exhaustL,
      exhaustR,
      thrust,
      this.shieldRing,
    );
    this.player.position.set(0, -5, 0);
    this.scene.add(this.player);

    const bodyGlow = glowSprite(0x2ea8c9, 4.2);
    bodyGlow.position.z = -0.8;
    bodyGlow.material.opacity = 0.16;
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

      const darter = new THREE.Group();
      const darterBody = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.1, 4), this.darterMat);
      darterBody.rotation.z = Math.PI;
      const darterWing = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.14), this.trimMat);
      darterWing.position.y = 0.3;
      darter.add(darterBody, darterWing);

      const turret = new THREE.Group();
      const turretBodyGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 6);
      turretBodyGeo.rotateX(Math.PI / 2);
      const turretBody = new THREE.Mesh(turretBodyGeo, this.turretMat);
      const turretRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.66, 0.07, 8, 24),
        this.turretRingMat,
      );
      turret.add(turretBody, turretRing);

      const glow = glowSprite(ROCK, 1.9);
      glow.position.z = -0.4;
      glow.material.opacity = 0.35;

      group.add(meteor, fighter, bomber, darter, turret, glow);
      group.visible = false;
      this.scene.add(group);

      this.foes.push({
        group,
        meteor,
        edge,
        fighter,
        bomber,
        darter,
        turret,
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

  private buildBoss() {
    const group = new THREE.Group();

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 0), this.bossMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.1, 8, 48), this.bossRingMat);

    const wings = new THREE.Group();
    const wingGeo = new THREE.BoxGeometry(1.6, 0.2, 0.4);
    const wingL = new THREE.Mesh(wingGeo, this.bossMat);
    wingL.position.set(-1.9, -0.2, 0);
    wingL.rotation.z = -0.18;
    const wingR = new THREE.Mesh(wingGeo, this.bossMat);
    wingR.position.set(1.9, -0.2, 0);
    wingR.rotation.z = 0.18;
    wings.add(wingL, wingR);

    const spikes = new THREE.Group();
    const spikeGeo = new THREE.ConeGeometry(0.16, 0.85, 4);
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(spikeGeo, this.bossMat);
      const a = (i / 6) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0);
      spike.rotation.z = a - Math.PI / 2;
      spikes.add(spike);
    }

    const glow = glowSprite(ROCK, 6.5);
    glow.position.z = -0.7;
    glow.material.opacity = 0.3;

    group.add(core, ring, wings, spikes, glow);
    group.visible = false;
    this.scene.add(group);

    this.boss = {
      group,
      core,
      ring,
      wings,
      spikes,
      glow,
      alive: false,
      kind: 'meteor',
      name: BOSS_NAMES.meteor,
      hp: 1,
      maxHp: 1,
      radius: 1.9,
      entering: true,
      attackIn: 2,
      spawnIn: 4,
      spiral: 0,
    };
  }

  private buildShots() {
    for (let i = 0; i < SHOT_POOL; i++) {
      const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.bullets.push({ mesh, active: false, vx: 0, vy: 17, pierce: 0 });
    }
    for (let i = 0; i < ENEMY_SHOT_POOL; i++) {
      const mesh = new THREE.Mesh(this.shardGeo, this.shardMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.enemyBullets.push({ mesh, active: false, vx: 0, vy: -5, pierce: 0 });
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
    return clamp(x, -this.halfW + 1.4, this.halfW - 1.4);
  }

  private clampY(y: number) {
    return clamp(y, -this.halfH + 1.8, this.halfH - 2);
  }

  /* ---------------------------------------------------------------- */

  protected reset() {
    this.mode = 'play';
    this.phase = 'wave';
    this.elapsed = 0;
    this.waveClock = 0;
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
    this.bossWarned = false;
    this.drag = null;
    this.keys.clear();

    this.boss.alive = false;
    this.boss.group.visible = false;

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
      this.movePlayer(dt);

      this.shield = Math.max(0, this.shield - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.player.visible = this.invuln <= 0 || Math.floor(t * 14) % 2 === 0;
      this.shieldRing.visible = this.shield > 0;
      this.shieldRing.rotation.z += dt * 1.6;
      this.shieldRing.material.opacity = 0.45 + Math.sin(t * 8) * 0.2;

      this.fireIn -= dt;
      if (this.fireIn <= 0) {
        this.fireIn = Math.max(0.12, 0.24 - (this.weapon - 1) * 0.032);
        this.shoot();
      }

      if (this.phase === 'wave') {
        this.waveClock += dt;
        if (!this.bossWarned && this.waveClock >= WAVE_TIME - 3) {
          this.bossWarned = true;
          this.ui.float('RAJA MENDATANG', window.innerWidth / 2, window.innerHeight * 0.3, 'bad');
          sfx.timeUp();
        }
        if (this.waveClock >= WAVE_TIME) {
          this.spawnBoss();
        } else {
          this.spawnIn -= dt;
          if (this.spawnIn <= 0) {
            this.spawnFoe();
            if (this.level >= 4 && this.rng() < 0.3) this.spawnFoe();
          }
        }
      } else {
        this.updateBoss(dt);
        if (this.mode !== 'play') return;
      }

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
    if (this.phase === 'boss' && this.boss.alive) {
      return `${this.boss.name} · ${Math.max(0, this.boss.hp)}/${this.boss.maxHp}`;
    }
    return `LV ${this.level} · ${this.hp}/${MAX_HP} · W${this.weapon}`;
  }

  private updateHud() {
    const ratio =
      this.phase === 'boss' && this.boss.alive
        ? this.boss.hp / this.boss.maxHp
        : this.waveClock / WAVE_TIME;
    this.ui.setMid(this.hudText(), clamp(ratio, 0, 1));
  }

  /* ---------------------------------------------------------------- */

  private pickFoeKind(): FoeKind {
    const r = this.rng();
    const level = this.level;
    if (level <= 1) return r < 0.58 ? 'meteor' : 'fighter';
    if (level === 2) return r < 0.4 ? 'meteor' : r < 0.78 ? 'fighter' : 'darter';
    if (level === 3) {
      return r < 0.28 ? 'meteor' : r < 0.56 ? 'fighter' : r < 0.76 ? 'darter' : r < 0.9 ? 'bomber' : 'turret';
    }
    return r < 0.2 ? 'meteor' : r < 0.45 ? 'fighter' : r < 0.65 ? 'darter' : r < 0.84 ? 'bomber' : 'turret';
  }

  private spawnFoe(forceKind?: FoeKind, atX?: number, atY?: number) {
    const level = this.level;
    this.spawnIn = Math.max(0.2, 0.82 - (level - 1) * 0.05) * rand(0.75, 1.2, this.rng);

    const foe = this.foes.find((f) => !f.alive);
    if (!foe) return;
    const kind = forceKind ?? this.pickFoeKind();

    foe.alive = true;
    foe.kind = kind;
    foe.big = kind === 'meteor' && this.rng() < 0.22;
    foe.fireIn = rand(0.6, 1.6, this.rng);
    foe.spin = rand(-1.6, 1.6, this.rng);
    foe.group.position.set(
      atX ?? rand(-this.halfW + 1.4, this.halfW - 1.4, this.rng),
      atY ?? this.halfH + 1.6,
      0,
    );
    foe.group.rotation.set(0, 0, 0);
    foe.group.visible = true;

    foe.meteor.visible = kind === 'meteor';
    foe.fighter.visible = kind === 'fighter';
    foe.bomber.visible = kind === 'bomber';
    foe.darter.visible = kind === 'darter';
    foe.turret.visible = kind === 'turret';
    foe.glow.material.color.set(FOE_COLORS[kind]);

    if (kind === 'meteor') {
      foe.hp = foe.big ? 3 + Math.floor(level / 4) : 1;
      foe.radius = foe.big ? 0.95 : 0.6;
      foe.vy = rand(2.1, 2.9, this.rng) + level * 0.18;
      foe.vx = rand(-1.0, 1.0, this.rng);
      foe.meteor.scale.setScalar(foe.big ? 1.6 : 1);
      foe.meteor.rotation.set(this.rng() * 3, this.rng() * 3, 0);
    } else if (kind === 'fighter') {
      foe.hp = 1 + Math.floor(level / 3);
      foe.radius = 0.6;
      foe.vy = 1.8 + level * 0.12;
      foe.vx = (this.playerX - foe.group.position.x) * 0.2;
    } else if (kind === 'bomber') {
      foe.hp = 5 + level * 2;
      foe.radius = 0.85;
      foe.vy = 1.1 + level * 0.06;
      foe.vx = 0;
    } else if (kind === 'darter') {
      foe.hp = 1;
      foe.radius = 0.42;
      foe.vy = 4.2 + level * 0.22;
      foe.vx = 0;
    } else {
      foe.hp = 4 + Math.floor(level * 1.2);
      foe.radius = 0.75;
      foe.vy = 0.9 + level * 0.05;
      foe.vx = 0;
      foe.fireIn = rand(0.4, 1, this.rng);
    }
  }

  private updateFoes(dt: number) {
    const minY = -this.halfH - 2.5;
    for (const foe of this.foes) {
      if (!foe.alive) continue;
      if (foe.kind === 'darter') {
        foe.vx = Math.sin(this.elapsed * 5 + foe.spin) * 3.4;
      }
      foe.group.position.x += foe.vx * dt;
      foe.group.position.y -= foe.vy * dt;

      if (foe.kind === 'meteor') {
        foe.meteor.rotation.x += foe.spin * dt;
        foe.meteor.rotation.y += foe.spin * 0.8 * dt;
      } else if (foe.kind === 'fighter') {
        foe.fighter.rotation.z = Math.sin(foe.group.position.y * 0.6) * 0.12;
        foe.fireIn -= dt;
        if (foe.fireIn <= 0) {
          foe.fireIn = Math.max(0.45, 1.5 - this.level * 0.08);
          this.fireEnemy(foe);
        }
      } else if (foe.kind === 'bomber') {
        foe.bomber.rotation.z += dt * 0.4;
        foe.fireIn -= dt;
        if (foe.fireIn <= 0) {
          foe.fireIn = Math.max(1.0, 2.2 - this.level * 0.08);
          this.fireFan(foe.group.position, 3, 0.5, 3.4 + this.level * 0.22);
        }
      } else if (foe.kind === 'turret') {
        foe.turret.rotation.z += dt * 0.6;
        foe.fireIn -= dt;
        if (foe.fireIn <= 0) {
          foe.fireIn = Math.max(0.9, 2.2 - this.level * 0.1);
          this.fireFan(foe.group.position, 3, 0.42, 3.6 + this.level * 0.24);
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

  private fireShot(x: number, y: number, vx: number, vy: number) {
    const shot = this.enemyBullets.find((s) => !s.active);
    if (!shot) return;
    shot.active = true;
    shot.mesh.visible = true;
    shot.mesh.position.set(x, y, 0);
    shot.vx = vx;
    shot.vy = vy;
  }

  private fireFan(origin: THREE.Vector3, count: number, arc: number, speed: number) {
    const base = Math.atan2(this.playerY - origin.y, this.playerX - origin.x);
    const start = base - arc / 2;
    const step = count > 1 ? arc / (count - 1) : 0;
    for (let i = 0; i < count; i++) {
      const a = start + step * i;
      this.fireShot(origin.x, origin.y, Math.cos(a) * speed, Math.sin(a) * speed);
    }
  }

  private fireEnemy(foe: Foe) {
    const count = this.level >= 5 ? 2 : 1;
    this.fireFan(foe.group.position, count, 0.18, 4.2 + this.level * 0.3);
  }

  private shoot() {
    const y = this.playerY + 1.65;
    const patterns: Array<Array<{ x: number; vx: number }>> = [
      [{ x: 0, vx: 0 }],
      [
        { x: -0.34, vx: 0 },
        { x: 0.34, vx: 0 },
      ],
      [
        { x: 0, vx: 0 },
        { x: -0.42, vx: -2.4 },
        { x: 0.42, vx: 2.4 },
      ],
      [
        { x: -0.5, vx: 0 },
        { x: 0.5, vx: 0 },
        { x: -0.8, vx: -1.8 },
        { x: 0.8, vx: 1.8 },
      ],
      [
        { x: 0, vx: 0 },
        { x: -0.4, vx: -2.2 },
        { x: 0.4, vx: 2.2 },
        { x: -0.75, vx: -4.4 },
        { x: 0.75, vx: 4.4 },
      ],
    ];
    const pierce = this.weapon >= MAX_WEAPON ? 2 : 0;
    for (const o of patterns[Math.min(this.weapon, MAX_WEAPON) - 1]) {
      const shot = this.bullets.find((s) => !s.active);
      if (!shot) break;
      shot.active = true;
      shot.mesh.visible = true;
      shot.mesh.position.set(this.playerX + o.x, y, 0);
      shot.vx = o.vx;
      shot.vy = 17;
      shot.pierce = pierce;
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

      const boss = this.boss;
      if (boss.alive) {
        const dx = shot.mesh.position.x - boss.group.position.x;
        const dy = shot.mesh.position.y - boss.group.position.y;
        if (dx * dx + dy * dy <= (boss.radius + 0.2) ** 2) {
          boss.hp -= 1;
          this.particles.spawn(shot.mesh.position, 0xd8fbff, 4, 3, 0.1);
          shot.active = false;
          shot.mesh.visible = false;
          if (boss.hp <= 0) this.killBoss();
          continue;
        }
      }

      for (const foe of this.foes) {
        if (!foe.alive) continue;
        const dx = shot.mesh.position.x - foe.group.position.x;
        const dy = shot.mesh.position.y - foe.group.position.y;
        if (dx * dx + dy * dy > (foe.radius + 0.18) ** 2) continue;

        foe.hp -= 1;
        if (shot.pierce > 0) shot.pierce--;
        else {
          shot.active = false;
          shot.mesh.visible = false;
        }
        this.particles.spawn(shot.mesh.position, 0xd8fbff, 4, 3, 0.1);
        if (foe.hp <= 0) this.killFoe(foe);
        if (!shot.active) break;
      }
    }

    for (const shot of this.enemyBullets) {
      if (!shot.active) continue;
      shot.mesh.position.x += shot.vx * dt;
      shot.mesh.position.y += shot.vy * dt;
      if (
        shot.mesh.position.y < -this.halfH - 2 ||
        shot.mesh.position.y > this.halfH + 2 ||
        Math.abs(shot.mesh.position.x) > this.halfW + 2
      ) {
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

  /* ---------------------------------------------------------------- */

  private spawnBoss() {
    const rank = Math.floor((this.level - 1) / BOSS_KINDS.length);
    const kind = BOSS_KINDS[(this.level - 1) % BOSS_KINDS.length];
    const boss = this.boss;
    const color = BOSS_COLORS[kind];

    boss.alive = true;
    boss.kind = kind;
    boss.name = BOSS_NAMES[kind] + (rank ? ` ${RANKS[Math.min(rank, RANKS.length - 1)]}` : '');
    boss.maxHp = boss.hp = Math.round((50 + this.level * 28) * (1 + rank * 0.6));
    boss.radius = 1.9;
    boss.entering = true;
    boss.attackIn = 1.8;
    boss.spawnIn = kind === 'carrier' || kind === 'void' ? 3 : 99;
    boss.spiral = 0;
    boss.group.position.set(0, this.halfH + 4, 0);
    boss.group.visible = true;

    this.bossMat.color.set(color);
    this.bossMat.emissive.set(color);
    this.bossRingMat.color.set(color);
    boss.glow.material.color.set(color);
    boss.ring.visible = kind !== 'fortress';
    boss.wings.visible = kind === 'carrier' || kind === 'fortress';
    boss.spikes.visible = kind === 'meteor' || kind === 'void';
    boss.core.scale.setScalar(kind === 'fortress' ? 1.3 : kind === 'carrier' ? 1 : 1.1);

    this.phase = 'boss';
    this.ui.float(boss.name, window.innerWidth / 2, window.innerHeight * 0.3, 'bad');
    this.updateHud();
    sfx.timeUp();
  }

  private updateBoss(dt: number) {
    const boss = this.boss;
    if (!boss.alive) return;
    const t = this.elapsed;

    if (boss.entering) {
      boss.group.position.y = damp(boss.group.position.y, this.halfH - 3.6, 2.4, dt);
      if (boss.group.position.y < this.halfH - 3.4) boss.entering = false;
    } else {
      const span = Math.max(2, this.halfW - 2.8);
      boss.group.position.x = Math.sin(t * (0.5 + this.level * 0.02)) * span;
      boss.group.position.y = this.halfH - 3.6 + Math.sin(t * 1.4) * 0.4;
    }
    boss.group.rotation.z = Math.sin(t * 0.9) * 0.1;
    boss.ring.rotation.z += dt * 1.3;
    boss.core.rotation.x += dt * 0.4;
    boss.core.rotation.y += dt * 0.6;
    boss.glow.material.opacity = 0.26 + Math.sin(t * 5) * 0.08;

    const dx = boss.group.position.x - this.playerX;
    const dy = boss.group.position.y - this.playerY;
    if (dx * dx + dy * dy < (boss.radius + 0.45) ** 2) {
      this.hitPlayer();
      if (this.mode !== 'play') return;
    }
    if (boss.entering) return;

    const speed = 4.4 + this.level * 0.32;
    boss.spawnIn -= dt;
    if (boss.spawnIn <= 0) {
      if (boss.kind === 'carrier') {
        boss.spawnIn = Math.max(3, 6 - this.level * 0.2);
        this.spawnFoe('fighter', boss.group.position.x - 1.4, boss.group.position.y);
        this.spawnFoe('fighter', boss.group.position.x + 1.4, boss.group.position.y);
      } else if (boss.kind === 'void') {
        boss.spawnIn = Math.max(1.6, 3 - this.level * 0.1);
        this.fireFan(boss.group.position, 3, 0.4, speed);
      }
    }

    boss.attackIn -= dt;
    if (boss.attackIn > 0) return;
    const rank = Math.floor((this.level - 1) / BOSS_KINDS.length);
    switch (boss.kind) {
      case 'meteor': {
        boss.attackIn = Math.max(0.85, 1.9 - this.level * 0.06);
        const count = 9 + Math.min(5, Math.floor(this.level / 2));
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + t * 0.5;
          this.fireShot(
            boss.group.position.x,
            boss.group.position.y,
            Math.cos(a) * speed * 0.75,
            Math.sin(a) * speed * 0.75,
          );
        }
        if (rank > 0) this.fireFan(boss.group.position, 3, 0.5, speed);
        break;
      }
      case 'carrier': {
        boss.attackIn = Math.max(0.7, 1.5 - this.level * 0.05);
        this.fireFan(boss.group.position, 3 + Math.min(2, Math.floor(this.level / 4)), 0.42, speed);
        if (rank > 0) this.fireRing(boss.group.position, 8, speed * 0.7, t);
        break;
      }
      case 'fortress': {
        boss.attackIn = Math.max(1.1, 2.2 - this.level * 0.07);
        this.fireFan(boss.group.position, 5 + Math.min(2, Math.floor(this.level / 4)), 0.85, speed * 0.9);
        if (rank > 0) {
          this.fireShot(
            boss.group.position.x,
            boss.group.position.y,
            Math.cos(t * 2.4) * speed,
            Math.sin(t * 2.4) * speed,
          );
        }
        break;
      }
      case 'void': {
        boss.attackIn = 0.15;
        boss.spiral += 0.38;
        this.fireShot(
          boss.group.position.x,
          boss.group.position.y,
          Math.cos(boss.spiral) * speed,
          Math.sin(boss.spiral) * speed,
        );
        if (rank > 0 && this.rng() < 0.06) {
          this.fireRing(boss.group.position, 10, speed * 0.65, t);
        }
        break;
      }
    }
  }

  private fireRing(origin: THREE.Vector3, count: number, speed: number, phase: number) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + phase * 0.4;
      this.fireShot(origin.x, origin.y, Math.cos(a) * speed, Math.sin(a) * speed);
    }
  }

  private killBoss() {
    const boss = this.boss;
    boss.alive = false;
    boss.group.visible = false;
    const color = BOSS_COLORS[boss.kind];
    this.particles.spawn(boss.group.position, color, 60, 8);
    this.particles.spawn(boss.group.position, 0xffffff, 30, 5);
    this.ui.shake(1.6);
    this.ui.flash('#ffd166');
    sfx.bomb();
    sfx.gold();

    const bonus = 600 * this.level;
    this.score += bonus;
    this.ui.setScore(this.score, true);
    this.ui.float(`RAJA TUMBANG +${bonus}`, window.innerWidth / 2, window.innerHeight * 0.3, 'gold');
    this.spawnPickup(boss.group.position);

    for (const shot of this.enemyBullets) {
      shot.active = false;
      shot.mesh.visible = false;
    }

    this.level++;
    this.phase = 'wave';
    this.waveClock = 0;
    this.bossWarned = false;
    this.spawnIn = 0.9;
    this.ui.float(`LEVEL ${this.level}`, window.innerWidth / 2, window.innerHeight * 0.34, 'gold');
    this.updateHud();
  }

  private killFoe(foe: Foe) {
    const base =
      foe.kind === 'meteor' ? (foe.big ? 22 : 10)
      : foe.kind === 'fighter' ? 16
      : foe.kind === 'darter' ? 14
      : foe.kind === 'turret' ? 32
      : 38;
    const value = base * this.level;
    this.score += value;
    this.ui.setScore(this.score, true);

    const color = FOE_COLORS[foe.kind];
    this.particles.spawn(foe.group.position, color, foe.kind === 'bomber' || foe.kind === 'turret' ? 26 : 16, 5);
    if (foe.kind === 'bomber' || foe.kind === 'turret') sfx.bomb();
    else sfx.smash(2);

    const drop = this.rng() < 0.15 || this.sinceDrop >= 10;
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
      if (this.weapon < MAX_WEAPON) {
        this.weapon++;
        this.ui.float(`SENJATA W${this.weapon}`, sx, sy);
      } else {
        const bonus = 200 * this.level;
        this.score += bonus;
        this.ui.setScore(this.score, true);
        this.ui.float(`SENJATA MAKS +${bonus}`, sx, sy, 'gold');
      }
    } else {
      this.shield = 5;
      this.ui.float('PERISAI 5s', sx, sy);
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
    this.invuln = 1.3;
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
