import * as THREE from 'three';
import { BaseGame, glowSprite, type StageUI } from '../core/stage';
import { sfx } from '../core/audio';
import { clamp, damp, rand } from '../core/util';

type Mode = 'idle' | 'play' | 'dead';
type Phase = 'wave' | 'boss';
type FoeKind = 'meteor' | 'fighter' | 'bomber' | 'darter' | 'turret';
type BossKind = 'meteor' | 'carrier' | 'fortress' | 'void' | 'storm' | 'crown';
type PickupType = 'hp' | 'weapon' | 'shield';

const MAX_HP = 5;
const START_HP = 3;
const MAX_WEAPON_LEVEL = 10;
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
const GOLD = 0xffd166;
const STORM = 0x67e8f9;

const WEAPON_FORMS = ['LANCE', 'NOVA', 'SEEKER', 'RAIL', 'RING', 'WHIP'] as const;
type WeaponForm = (typeof WEAPON_FORMS)[number];
const WEAPON_COLORS: Record<WeaponForm, number> = {
  LANCE: 0x9ff6ff,
  NOVA: 0xffa14e,
  SEEKER: 0xffd166,
  RAIL: 0xff5db1,
  RING: 0x4ee1ff,
  WHIP: 0xc084fc,
};

const BOSS_KINDS: BossKind[] = ['meteor', 'carrier', 'fortress', 'void', 'storm', 'crown'];
const BOSS_NAMES: Record<BossKind, string> = {
  meteor: 'RAJA METEOR',
  carrier: 'RAJA SAYAP',
  fortress: 'RAJA BOMBARDIR',
  void: 'RAJA VOID',
  storm: 'RAJA BADAI',
  crown: 'RAJA MAHKOTA',
};
const BOSS_COLORS: Record<BossKind, number> = {
  meteor: ROCK,
  carrier: HOSTILE,
  fortress: BOMBER,
  void: VIOLET,
  storm: STORM,
  crown: GOLD,
};
const BOSS_RADII: Record<BossKind, number> = {
  meteor: 1.9,
  carrier: 1.8,
  fortress: 2.1,
  void: 1.7,
  storm: 1.8,
  crown: 1.6,
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
  variants: Record<BossKind, THREE.Group>;
  spin: THREE.Group | null;
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
  burstCount: number;
}

interface Shot {
  mesh: THREE.Group;
  active: boolean;
  vx: number;
  vy: number;
  pierce: number;
  dmg: number;
  turn: number;
  form: WeaponForm;
  amp: number;
  freq: number;
  phase: number;
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
    new THREE.TorusGeometry(1.3, 0.055, 8, 40),
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
  private weaponForm: WeaponForm = 'LANCE';
  private weaponLevel = 1;
  private shield = 0;
  private invuln = 0;
  private deadIn = 0;
  private spawnIn = 0.6;
  private fireIn = 0;
  private sinceDrop = 0;
  private hudIn = 0;
  private bossWarned = false;
  private boss!: Boss;
  private bossSpins!: Record<BossKind, THREE.Group | null>;
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
  private trimMat = new THREE.MeshBasicMaterial({ color: 0xffe0e6 });
  private bulletGeos: Record<WeaponForm, THREE.BufferGeometry> = {
    LANCE: new THREE.BoxGeometry(0.09, 0.72, 0.09),
    NOVA: new THREE.OctahedronGeometry(0.17, 0),
    SEEKER: new THREE.ConeGeometry(0.12, 0.55, 6),
    RAIL: new THREE.BoxGeometry(0.07, 1.6, 0.07),
    RING: new THREE.TetrahedronGeometry(0.22),
    WHIP: new THREE.BoxGeometry(0.15, 0.42, 0.15),
  };
  private bulletMats: Record<WeaponForm, THREE.MeshBasicMaterial> = Object.fromEntries(
    WEAPON_FORMS.map((form) => [
      form,
      new THREE.MeshBasicMaterial({
        color: WEAPON_COLORS[form],
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.95,
      }),
    ]),
  ) as Record<WeaponForm, THREE.MeshBasicMaterial>;
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
    // Arcade-style red jet: swept delta wings, white leading edge, blue accents,
    // twin nozzles. Sized to fit the arena alongside foes (span ~2.3).
    const red = new THREE.MeshStandardMaterial({
      color: 0xd92828,
      emissive: 0x8a1212,
      emissiveIntensity: 0.55,
      roughness: 0.4,
      metalness: 0.22,
      flatShading: true,
    });
    const white = new THREE.MeshStandardMaterial({
      color: 0xf4f4f4,
      emissive: 0xdadada,
      emissiveIntensity: 0.4,
      roughness: 0.5,
      metalness: 0.05,
    });
    const blue = new THREE.MeshStandardMaterial({
      color: 0x2b3bd6,
      emissive: 0x1a2a9a,
      emissiveIntensity: 0.65,
      roughness: 0.4,
      metalness: 0.2,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x05070c,
      emissive: 0x0a1224,
      emissiveIntensity: 0.7,
      roughness: 0.12,
      metalness: 0.85,
    });
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d22,
      emissive: 0x08080a,
      roughness: 0.6,
      metalness: 0.5,
    });

    const parts: THREE.Object3D[] = [];
    const add = (o: THREE.Object3D) => parts.push(o);

    // Nose: red cone, twin-stage fuselage — no white tip, stubby body.
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 10), red);
    nose.position.y = 1.0;
    const midBody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 1.1, 10), red);
    midBody.position.y = 0.05;
    const rearBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.29, 0.72, 10), red);
    rearBody.position.y = -0.82;
    add(nose);
    add(midBody);
    add(rearBody);

    // Canopy: black teardrop with white glare dots.
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), canopyMat);
    canopy.scale.set(0.72, 1.5, 0.5);
    canopy.position.set(0, 0.62, 0.2);
    add(canopy);
    const glareGeo = new THREE.SphereGeometry(0.045, 6, 6);
    const glareMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const [x, y] of [
      [0.055, 0.8],
      [-0.05, 0.62],
      [0.04, 0.45],
    ] as Array<[number, number]>) {
      const glare = new THREE.Mesh(glareGeo, glareMat);
      glare.position.set(x, y, 0.3);
      add(glare);
    }

    // Wings: swept delta, mirrored, with white leading edge + blue accent.
    const wingShape = (sign: 1 | -1) => {
      const s = new THREE.Shape();
      s.moveTo(sign * 0.24, 0.42);
      s.lineTo(sign * 1.18, -0.78);
      s.lineTo(sign * 1.18, -0.9);
      s.lineTo(sign * 0.24, -0.22);
      s.closePath();
      return s;
    };
    for (const sign of [1, -1] as const) {
      const geo = new THREE.ExtrudeGeometry(wingShape(sign), { depth: 0.12, bevelEnabled: false });
      geo.translate(0, 0, -0.06);
      add(new THREE.Mesh(geo, red));
    }
    // Stripes along the leading edge of each wing.
    const stripeLen = 1.72;
    const stripeAngle = Math.atan2(-1.14, 0.94); // along leading edge
    for (const sign of [1, -1] as const) {
      const whiteStripe = new THREE.Mesh(new THREE.BoxGeometry(stripeLen, 0.1, 0.03), white);
      whiteStripe.position.set(sign * 0.71, -0.18, 0.075);
      whiteStripe.rotation.z = sign === 1 ? stripeAngle : Math.PI - stripeAngle;
      add(whiteStripe);
      const blueStripe = new THREE.Mesh(new THREE.BoxGeometry(stripeLen * 0.82, 0.06, 0.03), blue);
      blueStripe.position.set(sign * 0.63, -0.26, 0.078);
      blueStripe.rotation.z = sign === 1 ? stripeAngle : Math.PI - stripeAngle;
      add(blueStripe);
    }

    // Tail stabs: smaller swept wings, same paint scheme.
    const stabShape = (sign: 1 | -1) => {
      const s = new THREE.Shape();
      s.moveTo(sign * 0.22, -0.76);
      s.lineTo(sign * 0.86, -1.4);
      s.lineTo(sign * 0.8, -1.54);
      s.lineTo(sign * 0.22, -1.14);
      s.closePath();
      return s;
    };
    for (const sign of [1, -1] as const) {
      const geo = new THREE.ExtrudeGeometry(stabShape(sign), { depth: 0.1, bevelEnabled: false });
      geo.translate(0, 0, -0.05);
      add(new THREE.Mesh(geo, red));
      const whiteStripe = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.03), white);
      whiteStripe.position.set(sign * 0.54, -1.09, 0.06);
      whiteStripe.rotation.z = sign === 1 ? Math.atan2(-0.64, 0.64) : Math.PI - Math.atan2(-0.64, 0.64);
      add(whiteStripe);
      const blueStripe = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, 0.03), blue);
      blueStripe.position.set(sign * 0.48, -1.18, 0.062);
      blueStripe.rotation.z = sign === 1 ? Math.atan2(-0.64, 0.64) : Math.PI - Math.atan2(-0.64, 0.64);
      add(blueStripe);
    }

    // Vertical tails: small angled fins seen edge-on from top.
    const finGeo = new THREE.BoxGeometry(0.07, 0.5, 0.2);
    for (const sign of [1, -1] as const) {
      const fin = new THREE.Mesh(finGeo, red);
      fin.position.set(sign * 0.24, -1.06, 0.16);
      fin.rotation.z = sign * 0.32;
      add(fin);
    }

    // Twin nozzles with hot glow.
    const nozzleGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.22, 8);
    nozzleGeo.rotateX(Math.PI / 2);
    for (const sign of [1, -1] as const) {
      const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
      nozzle.position.set(sign * 0.17, -1.26, 0);
      add(nozzle);
    }
    const exhaustL = glowSprite(0xa8d8ff, 1.15);
    exhaustL.position.set(-0.17, -1.4, -0.15);
    exhaustL.material.opacity = 0.85;
    const exhaustR = glowSprite(0xa8d8ff, 1.15);
    exhaustR.position.set(0.17, -1.4, -0.15);
    exhaustR.material.opacity = 0.85;
    const thrust = glowSprite(0x7ecbff, 2.3);
    thrust.position.set(0, -1.62, -0.4);
    thrust.material.opacity = 0.3;
    add(exhaustL);
    add(exhaustR);
    add(thrust);

    this.shieldRing.visible = false;
    this.player.add(...parts, this.shieldRing);
    this.player.position.set(0, -5, 0);
    this.scene.add(this.player);

    const bodyGlow = glowSprite(0xd92828, 3.1);
    bodyGlow.position.z = -0.8;
    bodyGlow.material.opacity = 0.14;
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
    const mat = (color: number, glow = 0.45) =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: glow,
        roughness: 0.35,
        metalness: 0.18,
        flatShading: true,
      });
    const flat = (color: number, opacity = 0.9) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

    const builders: Record<BossKind, () => { variant: THREE.Group; spin: THREE.Group | null }> = {
      meteor: () => {
        // Jagged asteroid king with orbiting debris.
        const variant = new THREE.Group();
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 0), mat(ROCK, 0.5));
        core.scale.set(1, 0.92, 0.8);
        const spin = new THREE.Group();
        const chunkGeo = new THREE.TetrahedronGeometry(0.34);
        for (let i = 0; i < 5; i++) {
          const chunk = new THREE.Mesh(chunkGeo, mat(ROCK, 0.6));
          const a = (i / 5) * Math.PI * 2;
          chunk.position.set(Math.cos(a) * 2.15, Math.sin(a) * 2.15, 0);
          chunk.rotation.set(a, a * 1.7, 0);
          spin.add(chunk);
        }
        variant.add(core, spin);
        return { variant, spin };
      },
      carrier: () => {
        // Crimson winged battle-barge: twin crescent wings, spine pods.
        const variant = new THREE.Group();
        const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), mat(HOSTILE, 0.5));
        body.scale.set(0.9, 1.5, 0.7);
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0.45);
        wingShape.lineTo(2.35, -0.55);
        wingShape.lineTo(2.05, -1.05);
        wingShape.lineTo(0.1, -0.5);
        wingShape.closePath();
        const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.16, bevelEnabled: false });
        const wingMatL = mat(HOSTILE, 0.4);
        const wingR = new THREE.Mesh(wingGeo, wingMatL);
        wingR.position.set(0.45, 0.1, -0.08);
        const wingL = new THREE.Mesh(wingGeo, wingMatL);
        wingL.position.set(-0.45, 0.1, -0.08);
        wingL.scale.x = -1;
        const podGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.7, 6);
        podGeo.rotateX(Math.PI / 2);
        for (const x of [-0.3, 0, 0.3]) {
          const pod = new THREE.Mesh(podGeo, flat(0xff8ba0));
          pod.position.set(x, 1.0, 0.05);
          variant.add(pod);
        }
        variant.add(body, wingL, wingR);
        return { variant, spin: null };
      },
      fortress: () => {
        // Amber doom-wall: arc siege shield with cannon pods and hex dome.
        const variant = new THREE.Group();
        const arc = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.34, 8, 28, Math.PI), mat(BOMBER, 0.45));
        arc.rotation.z = Math.PI;
        const domeGeo = new THREE.CylinderGeometry(0.95, 1.1, 0.5, 6);
        domeGeo.rotateX(Math.PI / 2);
        const dome = new THREE.Mesh(domeGeo, mat(BOMBER, 0.6));
        for (let i = -2; i <= 2; i++) {
          const cannonGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.75, 6);
          cannonGeo.rotateX(Math.PI / 2);
          const cannon = new THREE.Mesh(cannonGeo, mat(BOMBER, 0.7));
          const a = Math.PI / 2 + (i * Math.PI) / 6.2;
          cannon.position.set(Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0.1);
          variant.add(cannon);
        }
        variant.add(arc, dome);
        return { variant, spin: null };
      },
      void: () => {
        // Violet abyss eye: dark orb inside a rotating halo.
        const variant = new THREE.Group();
        const halo = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.24, 8, 36), mat(VIOLET, 0.6));
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(1.05, 16, 12),
          new THREE.MeshStandardMaterial({
            color: 0x070312,
            emissive: 0x2a0a4a,
            emissiveIntensity: 0.9,
            roughness: 0.1,
            metalness: 0.7,
          }),
        );
        const pupil = glowSprite(VIOLET, 2.1);
        pupil.material.opacity = 0.75;
        halo.add(ring);
        variant.add(eye, pupil, halo);
        return { variant, spin: halo };
      },
      storm: () => {
        // Electric tempest: twin crescent blades orbiting a lightning core.
        const variant = new THREE.Group();
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), mat(STORM, 0.75));
        core.scale.set(0.8, 1.7, 0.7);
        const spin = new THREE.Group();
        const bladeShape = new THREE.Shape();
        bladeShape.moveTo(0.2, 0);
        bladeShape.quadraticCurveTo(1.4, 0.75, 2.3, 0.1);
        bladeShape.quadraticCurveTo(1.4, -0.45, 0.2, -0.35);
        bladeShape.closePath();
        const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.12, bevelEnabled: false });
        for (const sign of [1, -1]) {
          const blade = new THREE.Mesh(bladeGeo, mat(STORM, 0.55));
          blade.scale.x = sign;
          blade.position.z = -0.06;
          spin.add(blade);
        }
        variant.add(core, spin);
        return { variant, spin };
      },
      crown: () => {
        // Gilded tyrant: royal band with five radiant spires.
        const variant = new THREE.Group();
        const bandGeo = new THREE.CylinderGeometry(1.15, 1.28, 0.62, 8);
        bandGeo.rotateX(Math.PI / 2);
        const band = new THREE.Mesh(bandGeo, mat(GOLD, 0.55));
        const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat(0xffb703, 0.8));
        jewel.position.z = 0.35;
        const spireGeo = new THREE.ConeGeometry(0.22, 1.0, 4);
        for (let i = -2; i <= 2; i++) {
          const spire = new THREE.Mesh(spireGeo, mat(GOLD, 0.7));
          spire.position.set(i * 0.62, 1.05, 0);
          spire.scale.y = 1 + (2 - Math.abs(i)) * 0.28;
          variant.add(spire);
        }
        variant.add(band, jewel);
        return { variant, spin: null };
      },
    };

    const glow = glowSprite(ROCK, 6.8);
    glow.position.z = -0.7;
    glow.material.opacity = 0.32;
    group.add(glow);

    const variants = {} as Record<BossKind, THREE.Group>;
    const spins = {} as Record<BossKind, THREE.Group | null>;
    for (const kind of BOSS_KINDS) {
      const built = builders[kind]();
      built.variant.visible = false;
      variants[kind] = built.variant;
      spins[kind] = built.spin;
      group.add(built.variant);
    }
    this.bossSpins = spins;

    group.visible = false;
    this.scene.add(group);

    this.boss = {
      group,
      variants,
      spin: null,
      glow,
      alive: false,
      kind: 'meteor',
      name: BOSS_NAMES.meteor,
      hp: 1,
      maxHp: 1,
      radius: BOSS_RADII.meteor,
      entering: true,
      attackIn: 2,
      spawnIn: 4,
      spiral: 0,
      burstCount: 0,
    };
  }

  private buildShots() {
    for (let i = 0; i < SHOT_POOL; i++) {
      // One pooled group per live shot; child meshes toggled to match the active form.
      const mesh = new THREE.Group();
      for (const form of WEAPON_FORMS) {
        const child = new THREE.Mesh(this.bulletGeos[form], this.bulletMats[form]);
        child.name = form;
        child.visible = form === 'LANCE';
        mesh.add(child);
      }
      mesh.visible = false;
      this.scene.add(mesh);
      this.bullets.push({ mesh, active: false, vx: 0, vy: 17, pierce: 0, dmg: 1, turn: 0, form: 'LANCE', amp: 0, freq: 0, phase: 0 });
    }
    for (let i = 0; i < ENEMY_SHOT_POOL; i++) {
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(this.shardGeo, this.shardMat));
      mesh.visible = false;
      this.scene.add(mesh);
      this.enemyBullets.push({ mesh, active: false, vx: 0, vy: -5, pierce: 0, dmg: 1, turn: 0, form: 'LANCE', amp: 0, freq: 0, phase: 0 });
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
    this.weaponForm = 'LANCE';
    this.weaponLevel = 1;
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
        this.fireIn = this.fireInterval();
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
      // World drifts in slow motion while the player is gone — nothing fights back.
      this.driftingWorld(dt * 0.35);
      this.animateStars(dt, 1.1);
      if (this.deadIn <= 0) {
        this.mode = 'idle';
        this.finish();
      }
    }
  }

  private driftingWorld(dt: number) {
    const minY = -this.halfH - 2.5;
    for (const foe of this.foes) {
      if (!foe.alive) continue;
      foe.group.position.x += foe.vx * dt;
      foe.group.position.y -= foe.vy * dt;
      if (foe.kind === 'meteor') {
        foe.meteor.rotation.x += foe.spin * dt;
        foe.meteor.rotation.y += foe.spin * 0.8 * dt;
      }
      if (foe.group.position.y < minY) this.deactivate(foe);
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
      }
    }
    for (const shot of this.bullets) {
      if (!shot.active) continue;
      shot.mesh.position.x += shot.vx * dt;
      shot.mesh.position.y += shot.vy * dt;
      if (
        shot.mesh.position.y > this.halfH + 2 ||
        shot.mesh.position.y < -this.halfH - 2 ||
        Math.abs(shot.mesh.position.x) > this.halfW + 2
      ) {
        shot.active = false;
        shot.mesh.visible = false;
      }
    }
    const boss = this.boss;
    if (boss.alive) {
      boss.group.position.y -= 0.6 * dt;
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
      return `${this.boss.name} · ${Math.max(0, this.boss.hp)}/${this.boss.maxHp} · HP ${this.hp}/${MAX_HP} · ${this.weaponForm} ${this.weaponLevel}`;
    }
    return `LV ${this.level} · ${this.hp}/${MAX_HP} · ${this.weaponForm} ${this.weaponLevel}`;
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

  private fireInterval() {
    const l = this.weaponLevel;
    // [base, step, min] per form — setiap bentuk punya ritme sendiri.
    const curve: Record<WeaponForm, [number, number, number]> = {
      LANCE: [0.22, 0.012, 0.1],
      NOVA: [0.3, 0.015, 0.16],
      SEEKER: [0.38, 0.018, 0.22],
      RAIL: [0.4, 0.016, 0.24],
      RING: [0.62, 0.026, 0.36],
      WHIP: [0.5, 0.022, 0.3],
    };
    const [base, step, min] = curve[this.weaponForm];
    return Math.max(min, base - (l - 1) * step);
  }

  private spawnPlayerBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    dmg: number,
    pierce: number,
    turn: number,
    amp = 0,
    freq = 0,
    phase = 0,
  ) {
    const shot = this.bullets.find((s) => !s.active);
    if (!shot) return;
    shot.active = true;
    shot.mesh.visible = true;
    shot.mesh.position.set(x, y, 0);
    shot.mesh.rotation.z = Math.atan2(vy, vx) - Math.PI / 2;
    shot.vx = vx;
    shot.vy = vy;
    shot.dmg = dmg;
    shot.pierce = pierce;
    shot.turn = turn;
    shot.form = this.weaponForm;
    shot.amp = amp;
    shot.freq = freq;
    shot.phase = phase;
    for (const child of shot.mesh.children) child.visible = child.name === this.weaponForm;
  }

  private shoot() {
    const y = this.playerY + 1.52;
    const l = this.weaponLevel;
    const spawn = (
      x: number,
      yOff: number,
      vx: number,
      vy: number,
      dmg = 1,
      pierce = 0,
      turn = 0,
      amp = 0,
      freq = 0,
      phase = 0,
    ) =>
      this.spawnPlayerBullet(this.playerX + x, y + yOff, vx, vy, dmg, pierce, turn, amp, freq, phase);

    switch (this.weaponForm) {
      case 'LANCE': {
        // Focused piercing-less bolts; every 4 levels adds a parallel bolt and +1 damage.
        const count = 1 + Math.floor((l - 1) / 4);
        const dmg = 1 + Math.floor((l - 1) / 4);
        const pierce = l >= 8 ? 1 : 0;
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * 0.34;
          spawn(offset, 0, 0, 19, dmg, pierce);
        }
        break;
      }
      case 'NOVA': {
        // Shotgun wedge; level adds pellets and widens the cone slightly.
        const count = 3 + l;
        const arc = Math.min(0.95, 0.6 + l * 0.03);
        for (let i = 0; i < count; i++) {
          const a = Math.PI / 2 + (count > 1 ? (i / (count - 1) - 0.5) * arc : 0);
          const speed = rand(13, 17, this.rng);
          spawn(0, 0, Math.cos(a) * speed, Math.sin(a) * speed, 1, 0);
        }
        break;
      }
      case 'SEEKER': {
        // Homing missiles fanned at spawn; turn sharper with level.
        const count = 1 + Math.floor((l - 1) / 2);
        const dmg = 1 + Math.floor(l / 5);
        const turn = 2.4 + l * 0.5;
        for (let i = 0; i < count; i++) {
          const a = Math.PI / 2 + (count > 1 ? (i / (count - 1) - 0.5) * 1.1 : 0);
          spawn((i - (count - 1) / 2) * 0.4, 0, Math.cos(a) * 15, Math.sin(a) * 15, dmg, 0, turn);
        }
        break;
      }
      case 'RAIL': {
        // Heavy railgun lancers that punch through anything.
        const count = 1 + Math.floor((l - 1) / 3);
        const dmg = 2 + Math.floor(l / 4);
        const pierce = 2 + Math.floor(l / 2);
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * 0.5;
          spawn(offset, 0, 0, 26, dmg, pierce);
        }
        break;
      }
      case 'RING': {
        // Fan of 180° upward with a slow sway — every bolt counts, none wasted below.
        const count = 6 + l * 2;
        const dmg = l >= 8 ? 2 : 1;
        const sway = Math.sin(this.elapsed * 1.3) * 0.16;
        for (let i = 0; i < count; i++) {
          const a = (count > 1 ? (i / (count - 1)) * Math.PI : Math.PI / 2) + sway;
          spawn(0, 0, Math.cos(a) * 13.5, Math.sin(a) * 13.5, dmg, 0);
        }
        break;
      }
      case 'WHIP': {
        // Laser whip: a serpentine chain of energy segments that slithers
        // forward with growing amplitude as it unspools.
        const count = 5 + l;
        const amp = Math.min(2.4, 0.8 + l * 0.18);
        const dmg = l >= 7 ? 2 : 1;
        const pierce = 1 + Math.floor(l / 3);
        const freq = 11;
        for (let i = 0; i < count; i++) {
          spawn(0, 0, 0, 15, dmg, pierce, 0, amp, freq, i * 0.85);
        }
        break;
      }
    }
    sfx.laser();
  }

  private updateBullets(dt: number) {
    for (const shot of this.bullets) {
      if (!shot.active) continue;

      // Whips undulate laterally like a cracking lash.
      if (shot.amp > 0) {
        shot.phase += shot.freq * dt;
        shot.vx = Math.cos(shot.phase) * shot.amp;
        shot.mesh.rotation.z = Math.atan2(shot.vy, shot.vx) - Math.PI / 2;
      }

      // Seekers curve toward the nearest live target.
      if (shot.turn > 0) {
        const target = this.nearestTarget(shot.mesh.position);
        if (target) {
          const speed = Math.hypot(shot.vx, shot.vy);
          const want = Math.atan2(target.y - shot.mesh.position.y, target.x - shot.mesh.position.x);
          const cur = Math.atan2(shot.vy, shot.vx);
          let delta = want - cur;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          const next = cur + clamp(delta, -shot.turn * dt, shot.turn * dt);
          shot.vx = Math.cos(next) * speed;
          shot.vy = Math.sin(next) * speed;
          shot.mesh.rotation.z = next - Math.PI / 2;
        }
      }
      shot.mesh.position.x += shot.vx * dt;
      shot.mesh.position.y += shot.vy * dt;
      if (
        shot.mesh.position.y > this.halfH + 1.5 ||
        shot.mesh.position.y < -this.halfH - 1.5 ||
        Math.abs(shot.mesh.position.x) > this.halfW + 1.5
      ) {
        shot.active = false;
        shot.mesh.visible = false;
        continue;
      }

      const boss = this.boss;
      if (boss.alive) {
        const dx = shot.mesh.position.x - boss.group.position.x;
        const dy = shot.mesh.position.y - boss.group.position.y;
        if (dx * dx + dy * dy <= (boss.radius + 0.2) ** 2) {
          boss.hp -= shot.dmg;
          this.particles.spawn(shot.mesh.position, WEAPON_COLORS[shot.form], 4, 3, 0.1);
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

        foe.hp -= shot.dmg;
        if (shot.pierce > 0) shot.pierce--;
        else {
          shot.active = false;
          shot.mesh.visible = false;
        }
        this.particles.spawn(shot.mesh.position, WEAPON_COLORS[shot.form], 4, 3, 0.1);
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

  private nearestTarget(from: THREE.Vector3) {
    let best: THREE.Vector3 | null = null;
    let bestD = Infinity;
    for (const foe of this.foes) {
      if (!foe.alive) continue;
      const d = (foe.group.position.x - from.x) ** 2 + (foe.group.position.y - from.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = foe.group.position;
      }
    }
    const boss = this.boss;
    if (boss.alive) {
      const d = (boss.group.position.x - from.x) ** 2 + (boss.group.position.y - from.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = boss.group.position;
      }
    }
    return best;
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
    boss.radius = BOSS_RADII[kind];
    boss.entering = true;
    boss.attackIn = 1.8;
    boss.spawnIn = kind === 'carrier' || kind === 'void' ? 3 : kind === 'storm' ? 5 : 99;
    boss.spiral = 0;
    boss.burstCount = 0;
    boss.spin = this.bossSpins[kind];
    boss.group.position.set(0, this.halfH + 4, 0);
    boss.group.visible = true;

    for (const k of BOSS_KINDS) boss.variants[k].visible = k === kind;
    boss.glow.material.color.set(color);

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
    if (boss.spin) boss.spin.rotation.z += dt * (boss.kind === 'storm' ? 2.6 : 0.9);
    boss.variants[boss.kind].scale.setScalar(1 + Math.sin(t * 6) * 0.045);
    boss.glow.material.opacity = 0.26 + Math.sin(t * 5) * 0.08;

    const dx = boss.group.position.x - this.playerX;
    const dy = boss.group.position.y - this.playerY;
    const hitRadius = boss.radius * 0.72 + 0.15;
    if (dx * dx + dy * dy < hitRadius * hitRadius) {
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
      } else if (boss.kind === 'storm') {
        boss.spawnIn = Math.max(3.5, 6 - this.level * 0.15);
        this.fireFan(boss.group.position, 3, 0.35, speed);
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
      case 'storm': {
        boss.attackIn = 0.17;
        boss.spiral += 0.34;
        // Twin tempest arms; rank II+ opens a third.
        this.fireShot(
          boss.group.position.x,
          boss.group.position.y,
          Math.cos(boss.spiral) * speed,
          Math.sin(boss.spiral) * speed,
        );
        this.fireShot(
          boss.group.position.x,
          boss.group.position.y,
          Math.cos(boss.spiral + Math.PI) * speed,
          Math.sin(boss.spiral + Math.PI) * speed,
        );
        if (rank > 0) {
          this.fireShot(
            boss.group.position.x,
            boss.group.position.y,
            Math.cos(boss.spiral + Math.PI / 2) * speed,
            Math.sin(boss.spiral + Math.PI / 2) * speed,
          );
        }
        break;
      }
      case 'crown': {
        boss.attackIn = Math.max(0.55, 1.1 - this.level * 0.04);
        boss.burstCount++;
        if (boss.burstCount % 3 === 0) {
          // Dekrit raja: radial ring emas yang harus dihindari dari segala arah.
          this.fireRing(boss.group.position, 10 + Math.min(4, this.level), speed * 0.8, t);
        } else {
          this.fireFan(boss.group.position, 5, 0.3, speed * 1.15);
        }
        if (rank > 0) this.fireFan(boss.group.position, 2, 0.12, speed * 1.25);
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
      // Bentuk senjata selalu diacak ulang setiap pickup — dopamine gamble.
      const others = WEAPON_FORMS.filter((f) => f !== this.weaponForm);
      this.weaponForm = others[Math.floor(this.rng() * others.length)];
      if (this.weaponLevel < MAX_WEAPON_LEVEL) {
        this.weaponLevel++;
        this.ui.float(`${this.weaponForm} · LV ${this.weaponLevel}`, sx, sy, 'gold');
      } else {
        const bonus = 250 * this.level;
        this.score += bonus;
        this.ui.setScore(this.score, true);
        this.ui.float(`${this.weaponForm} · MAKS +${bonus}`, sx, sy, 'gold');
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
