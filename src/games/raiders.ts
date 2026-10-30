import * as THREE from 'three';
import { BaseGame, glowSprite, type StageUI } from '../core/stage';
import { sfx } from '../core/audio';
import { clamp, damp } from '../core/util';

type Mode = 'idle' | 'play' | 'dead' | 'over';

const ROWS = 3;
const ENEMY_POOL = 18;
const SHOT_POOL = 22;
const PLAYER_Y = -8.2;
const HULL_MAX = 3;

interface Enemy {
  group: THREE.Group;
  body: THREE.Mesh;
  glow: THREE.Sprite;
  alive: boolean;
  homeX: number;
  homeY: number;
  gold: boolean;
}

interface Shot {
  mesh: THREE.Mesh;
  active: boolean;
  vy: number;
}

export class RaidersGame extends BaseGame {
  private cam: THREE.OrthographicCamera;
  private player = new THREE.Group();
  private playerX = 0;
  private targetX = 0;
  private invuln = 0;

  private enemies: Enemy[] = [];
  private playerShots: Shot[] = [];
  private enemyShots: Shot[] = [];
  private stars: THREE.Points;
  private starPos: Float32Array;

  private mode: Mode = 'idle';
  private elapsed = 0;
  private deadIn = 0;
  private lives = HULL_MAX;
  private wave = 1;
  private waveTotal = ENEMY_POOL;
  private cols = 6;
  private halfW = 10;
  private aspect = 1;
  private formationX = 0;
  private formationY = 0;
  private dir = 1;
  private speed = 1.4;
  private fireIn = 0.9;
  private shotIn = 0;
  private hudIn = 0;
  private keys = new Set<string>();

  private enemyGeo = new THREE.OctahedronGeometry(0.52, 0);
  private enemyEdgeGeo = new THREE.EdgesGeometry(this.enemyGeo);
  private enemyMat = new THREE.MeshStandardMaterial({
    color: 0xff4d94,
    emissive: 0x6d0b32,
    roughness: 0.34,
    metalness: 0.4,
  });
  private goldMat = new THREE.MeshStandardMaterial({
    color: 0xffc861,
    emissive: 0x805400,
    roughness: 0.28,
    metalness: 0.5,
  });
  private enemyEdgeMat = new THREE.LineBasicMaterial({
    color: 0xffd6e6,
    transparent: true,
    opacity: 0.38,
  });
  private shotGeo = new THREE.BoxGeometry(0.12, 0.7, 0.12);
  private shotMat = new THREE.MeshBasicMaterial({
    color: 0x9ff6ff,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private bombGeo = new THREE.SphereGeometry(0.17, 8, 8);
  private bombMat = new THREE.MeshBasicMaterial({
    color: 0xff7a9e,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  constructor(host: HTMLElement, ui: StageUI) {
    super(host, ui);

    this.cam = new THREE.OrthographicCamera(-6, 6, 10, -10, 0.1, 60);
    this.cam.position.set(0, 0, 22);
    this.camera = this.cam;

    this.scene.add(new THREE.HemisphereLight(0x9db8ff, 0x0a0a18, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(4, 10, 9);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff4d94, 1.1);
    rim.position.set(-8, 2, -6);
    this.scene.add(rim);

    const nebulaA = glowSprite(0x4ee1ff, 11);
    nebulaA.position.set(-9, 4, -8);
    nebulaA.material.opacity = 0.16;
    this.scene.add(nebulaA);
    const nebulaB = glowSprite(0xff4d94, 9);
    nebulaB.position.set(8, -3, -7);
    nebulaB.material.opacity = 0.13;
    this.scene.add(nebulaB);

    this.stars = this.buildStars();
    this.starPos = this.stars.geometry.getAttribute('position').array as Float32Array;
    this.buildBoundary();
    this.buildPlayer();
    this.buildEnemies();
    this.buildShots();
    this.layoutWave();
    this.bindInput();
    this.mount();
  }

  /* ---------------------------------------------------------------- */

  private buildStars() {
    const count = 240;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
      positions[i * 3 + 2] = -10 + Math.random() * 8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0x9fe8ff,
        size: 0.07,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(points);
    return points;
  }

  private buildBoundary() {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-16, -9.6, 0),
      new THREE.Vector3(16, -9.6, 0),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: 0xff4d94,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(line);
  }

  private buildPlayer() {
    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(0.48, 1.5, 3),
      new THREE.MeshStandardMaterial({
        color: 0x4ee1ff,
        emissive: 0x0a6d84,
        roughness: 0.28,
        metalness: 0.55,
      }),
    );
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.14, 0.14),
      new THREE.MeshStandardMaterial({
        color: 0x9ff6ff,
        emissive: 0x0a5666,
        roughness: 0.3,
        metalness: 0.4,
      }),
    );
    wing.position.y = -0.38;
    this.player.add(hull, wing, glowSprite(0x4ee1ff, 2.4));
    this.player.position.set(0, PLAYER_Y, 0);
    this.scene.add(this.player);
  }

  private buildEnemies() {
    for (let i = 0; i < ENEMY_POOL; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(this.enemyGeo, this.enemyMat);
      body.scale.set(1.22, 0.74, 1);
      const glow = glowSprite(0xff4d94, 1.45);
      glow.position.z = -0.2;
      group.add(body, new THREE.LineSegments(this.enemyEdgeGeo, this.enemyEdgeMat), glow);
      group.visible = false;
      this.scene.add(group);
      this.enemies.push({ group, body, glow, alive: false, homeX: 0, homeY: 0, gold: false });
    }
  }

  private buildShots() {
    for (let i = 0; i < SHOT_POOL; i++) {
      const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.playerShots.push({ mesh, active: false, vy: 17 });

      const bomb = new THREE.Mesh(this.bombGeo, this.bombMat);
      bomb.visible = false;
      this.scene.add(bomb);
      this.enemyShots.push({ mesh: bomb, active: false, vy: -5 });
    }
  }

  /* ---------------------------------------------------------------- */

  private layoutWave() {
    this.cols = this.aspect < 0.8 ? 4 : 6;
    const count = Math.min(ENEMY_POOL, this.cols * ROWS);
    this.formationX = 0;
    this.formationY = 0;
    this.dir = 1;
    this.speed = 1.15 + this.wave * 0.22;
    this.fireIn = Math.max(0.55, 1.15 - this.wave * 0.08);
    this.alive = count;
    this.waveTotal = count;

    for (let i = 0; i < ENEMY_POOL; i++) {
      const enemy = this.enemies[i];
      if (i >= count) {
        enemy.alive = false;
        enemy.group.visible = false;
        continue;
      }
      const col = i % this.cols;
      const row = Math.floor(i / this.cols);
      enemy.alive = true;
      enemy.gold = this.rng() < 0.16;
      enemy.homeX = (col - (this.cols - 1) / 2) * 1.9;
      enemy.homeY = 3.4 + row * 1.55;
      enemy.group.position.set(enemy.homeX, enemy.homeY, 0);
      enemy.group.visible = true;
      enemy.body.material = enemy.gold ? this.goldMat : this.enemyMat;
      enemy.glow.material.color.set(enemy.gold ? 0xffc861 : 0xff4d94);
    }
  }

  private alive = 0;

  /* ---------------------------------------------------------------- */

  private bindInput() {
    const el = this.renderer.domElement;

    this.listen<PointerEvent>(el, 'pointerdown', (e) => {
      if (this.mode !== 'play') return;
      el.setPointerCapture(e.pointerId);
      this.pointTo(e.clientX);
    });
    this.listen<PointerEvent>(el, 'pointermove', (e) => {
      if (this.mode !== 'play' || !el.hasPointerCapture(e.pointerId)) return;
      this.pointTo(e.clientX);
    });

    this.listen<KeyboardEvent>(window, 'keydown', (e) => {
      if (this.mode !== 'play') return;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') {
        e.preventDefault();
        this.keys.add(e.code);
      }
    });
    this.listen<KeyboardEvent>(window, 'keyup', (e) => this.keys.delete(e.code));
  }

  private pointTo(clientX: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const n = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.targetX = clamp(n * this.halfW, -this.halfW + 0.8, this.halfW - 0.8);
  }

  /* ---------------------------------------------------------------- */

  protected reset() {
    this.mode = 'play';
    this.elapsed = 0;
    this.deadIn = 0;
    this.lives = HULL_MAX;
    this.wave = 1;
    this.playerX = 0;
    this.targetX = 0;
    this.invuln = 0;
    this.shotIn = 0;
    this.hudIn = 0;
    this.keys.clear();
    this.player.visible = true;
    for (const shot of [...this.playerShots, ...this.enemyShots]) {
      shot.active = false;
      shot.mesh.visible = false;
    }
    this.layoutWave();
    this.ui.setMid(this.hudText(), 0);
    sfx.start();
  }

  protected update(dt: number) {
    const t = performance.now() * 0.001;

    if (this.mode === 'idle') {
      this.player.position.y = PLAYER_Y + Math.sin(t * 1.8) * 0.12;
      this.animateStars(dt, 2.5);
      return;
    }

    if (this.mode === 'play') {
      this.elapsed += dt;

      const kb =
        (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) -
        (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
      if (kb) this.targetX += kb * 10 * dt;
      this.targetX = clamp(this.targetX, -this.halfW + 0.8, this.halfW - 0.8);

      this.playerX = damp(this.playerX, this.targetX, 15, dt);
      this.player.position.set(this.playerX, PLAYER_Y, 0);
      this.player.rotation.z = clamp((this.targetX - this.playerX) * 0.18, -0.35, 0.35);
      this.invuln = Math.max(0, this.invuln - dt);
      this.player.visible = this.invuln <= 0 || Math.floor(t * 14) % 2 === 0;

      this.shotIn -= dt;
      if (this.shotIn <= 0) {
        this.shotIn = 0.2;
        this.firePlayerShot();
      }

      this.updateFormation(dt);
      this.updateShots(dt);
      this.updateEnemyFire(dt);
      this.animateStars(dt, 4 + this.wave);

      this.hudIn -= dt;
      if (this.mode === 'play' && this.hudIn <= 0) {
        this.hudIn = 0.1;
        this.ui.setMid(this.hudText(), 1 - this.alive / Math.max(1, this.waveTotal));
      }
    } else if (this.mode === 'dead') {
      this.deadIn -= dt;
      this.animateStars(dt, 1.2);
      if (this.deadIn <= 0) {
        this.mode = 'over';
        this.finish();
      }
    }
  }

  private hudText() {
    return `LV ${this.wave} · HULL ${this.lives}`;
  }

  private updateFormation(dt: number) {
    this.formationX += this.dir * this.speed * dt;

    let minX = Infinity;
    let maxX = -Infinity;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      minX = Math.min(minX, enemy.homeX + this.formationX);
      maxX = Math.max(maxX, enemy.homeX + this.formationX);
    }
    if (!Number.isFinite(minX)) return;

    const edge = this.halfW - 0.75;
    if ((this.dir > 0 && maxX > edge) || (this.dir < 0 && minX < -edge)) {
      this.dir *= -1;
      this.formationY -= 0.5;
      sfx.gate();
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.group.position.set(
        enemy.homeX + this.formationX,
        enemy.homeY + this.formationY + Math.sin(performance.now() * 0.002 + enemy.homeX) * 0.04,
        0,
      );
      enemy.group.rotation.z = Math.sin(performance.now() * 0.0015 + enemy.homeX) * 0.08;
    }

    const lowest = Math.min(
      ...this.enemies.filter((e) => e.alive).map((e) => e.homeY + this.formationY),
    );
    if (lowest < PLAYER_Y + 1.5) {
      sfx.died();
      this.end();
    }
  }

  private updateEnemyFire(dt: number) {
    this.fireIn -= dt;
    if (this.fireIn > 0) return;
    this.fireIn = Math.max(0.34, 1.2 - this.wave * 0.1 - this.elapsed * 0.004);

    const alive = this.enemies.filter((e) => e.alive);
    if (!alive.length) return;
    const shooter = alive[Math.floor(this.rng() * alive.length)];
    const shot = this.enemyShots.find((s) => !s.active);
    if (!shot) return;
    shot.active = true;
    shot.vy = -4.6 - this.wave * 0.35;
    shot.mesh.visible = true;
    shot.mesh.position.copy(shooter.group.position);
  }

  private firePlayerShot() {
    const shot = this.playerShots.find((s) => !s.active);
    if (!shot) return;
    shot.active = true;
    shot.mesh.visible = true;
    shot.mesh.position.set(this.playerX, PLAYER_Y + 0.9, 0);
    sfx.laser();
  }

  private updateShots(dt: number) {
    for (const shot of this.playerShots) {
      if (!shot.active) continue;
      shot.mesh.position.y += shot.vy * dt;
      if (shot.mesh.position.y > 12) {
        shot.active = false;
        shot.mesh.visible = false;
        continue;
      }
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const dx = shot.mesh.position.x - enemy.group.position.x;
        const dy = shot.mesh.position.y - enemy.group.position.y;
        if (dx * dx + dy * dy > 0.42) continue;
        this.killEnemy(enemy);
        shot.active = false;
        shot.mesh.visible = false;
        break;
      }
    }

    for (const shot of this.enemyShots) {
      if (!shot.active) continue;
      shot.mesh.position.y += shot.vy * dt;
      if (shot.mesh.position.y < -11) {
        shot.active = false;
        shot.mesh.visible = false;
        continue;
      }
      const dx = shot.mesh.position.x - this.playerX;
      const dy = shot.mesh.position.y - PLAYER_Y;
      if (dx * dx + dy * dy < 0.6) {
        shot.active = false;
        shot.mesh.visible = false;
        this.hitPlayer();
        if (this.mode !== 'play') return;
      }
    }
  }

  private killEnemy(enemy: Enemy) {
    enemy.alive = false;
    enemy.group.visible = false;
    this.alive--;

    const value = (enemy.gold ? 30 : 12) + this.wave * 2;
    this.score += value;
    this.ui.setScore(this.score, true);
    this.ui.float(`+${value}`, window.innerWidth / 2, window.innerHeight * 0.42);
    this.particles.spawn(enemy.group.position, enemy.gold ? 0xffc861 : 0xff4d94, enemy.gold ? 24 : 12, 4);
    if (enemy.gold) sfx.gold();
    else sfx.smash(2);

    if (this.alive <= 0) this.clearWave();
  }

  private clearWave() {
    const bonus = 100 * this.wave;
    this.score += bonus;
    this.ui.setScore(this.score, true);
    this.ui.float(`LEVEL ${this.wave} CLEAR +${bonus}`, window.innerWidth / 2, window.innerHeight * 0.34, 'gold');
    sfx.gold();
    this.wave++;
    this.layoutWave();
    this.ui.setMid(this.hudText(), 0);
  }

  private hitPlayer() {
    if (this.invuln > 0 || this.mode !== 'play') return;
    this.lives--;
    this.invuln = 1.6;
    this.ui.shake();
    this.ui.flash('#ff4d94');
    this.ui.setMid(this.hudText(), 1 - this.alive / Math.max(1, this.waveTotal));
    this.particles.spawn(this.player.position, 0x4ee1ff, 26, 5);
    this.particles.spawn(this.player.position, 0xffffff, 10, 3);
    sfx.died();

    for (const shot of this.enemyShots) {
      shot.active = false;
      shot.mesh.visible = false;
    }
    if (this.lives <= 0) this.end();
  }

  private end() {
    if (this.mode !== 'play') return;
    this.mode = 'dead';
    this.deadIn = 0.85;
    this.ui.setMid('');
    this.player.visible = true;
  }

  private animateStars(dt: number, speed: number) {
    for (let i = 0; i < this.starPos.length; i += 3) {
      this.starPos[i + 1] -= speed * dt;
      if (this.starPos[i + 1] < -11) this.starPos[i + 1] = 11;
    }
    (this.stars.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  protected onResize(width: number, height: number) {
    this.aspect = width / height;
    const halfH = this.aspect < 0.8 ? 10.6 : 9.6;
    this.halfW = halfH * this.aspect;
    this.cam.left = -this.halfW;
    this.cam.right = this.halfW;
    this.cam.top = halfH;
    this.cam.bottom = -halfH;
    this.cam.updateProjectionMatrix();
    this.targetX = clamp(this.targetX, -this.halfW + 0.8, this.halfW - 0.8);
  }
}
