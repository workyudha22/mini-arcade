import * as THREE from 'three';
import { BaseGame, glowSprite, glowTexture, type StageUI } from '../core/stage';
import { sfx } from '../core/audio';
import { clamp, damp } from '../core/util';

type Mode = 'idle' | 'play' | 'dead' | 'over';

const COLS = 7;
const ROWS = 5;
const WALL = 5.2;
const TOP = 8.2;
const PADDLE_Y = -7.4;
const PADDLE_W = 2.6;
const BALL_R = 0.19;
const ACCENT = 0xffd166;
const BRICK_W = 1.18;
const BRICK_H = 0.7;
const STEP_X = 1.36;
const STEP_Y = 0.95;
const BRICK_TOP = 5.4;
const ROW_COLORS = [0xffe08a, 0xffb066, 0xff82a1, 0xbaa4ff, 0x6feaff];

interface Brick {
  x: number;
  y: number;
  row: number;
  alive: boolean;
}

export class PrismGame extends BaseGame {
  private cam: THREE.OrthographicCamera;
  private halfW = 6;
  private paddle = new THREE.Group();
  private paddleGlow!: THREE.Sprite;
  private ball = new THREE.Group();
  private ballGlow!: THREE.Sprite;
  private brickMesh!: THREE.InstancedMesh;
  private brickGlow!: THREE.InstancedMesh;
  private bricks: Brick[] = [];
  private dummy = new THREE.Object3D();

  private paddleX = 0;
  private targetX = 0;
  private ballPos = new THREE.Vector3(0, PADDLE_Y + 0.55, 0.45);
  private ballVel = new THREE.Vector2();
  private ballStuck = true;
  private launchIn = 0.8;
  private respawnIn = 0;
  private balls = 3;
  private wave = 1;
  private waveTotal = 1;
  private combo = 0;
  private keys = new Set<string>();

  private mode: Mode = 'idle';
  private deadIn = 0;
  private hudIn = 0;

  constructor(host: HTMLElement, ui: StageUI) {
    super(host, ui);

    this.cam = new THREE.OrthographicCamera(-6, 6, 9.4, -9.4, 0.1, 60);
    this.cam.position.set(0, 0, 24);
    this.camera = this.cam;

    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x080a12, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(4, 10, 9);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(ACCENT, 1.1);
    rim.position.set(-7, 2, -5);
    this.scene.add(rim);

    const topGlow = glowSprite(ACCENT, 13);
    topGlow.position.set(0, 5, -5);
    topGlow.material.opacity = 0.09;
    this.scene.add(topGlow);
    const bottomGlow = glowSprite(0x4ee1ff, 10);
    bottomGlow.position.set(0, -7, -5);
    bottomGlow.material.opacity = 0.08;
    this.scene.add(bottomGlow);

    this.buildArena();
    this.buildBricks();
    this.buildPaddle();
    this.buildBall();
    this.buildWave();
    this.bindInput();
    this.mount();
  }

  /* ---------------------------------------------------------------- */

  private buildArena() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(WALL * 2 + 0.4, TOP + 9.2),
      new THREE.MeshBasicMaterial({ color: 0x080b14, transparent: true, opacity: 0.94 }),
    );
    floor.position.set(0, (TOP - 8.8) / 2, -1.4);
    this.scene.add(floor);

    const pts: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const x = -WALL + (i * WALL * 2) / 8;
      pts.push(x, -8.8, -1.15, x, TOP, -1.15);
    }
    for (let j = 0; j <= 14; j++) {
      const y = -8.8 + (j * (TOP + 8.8)) / 14;
      pts.push(-WALL, y, -1.15, WALL, y, -1.15);
    }
    const grid = new THREE.BufferGeometry();
    grid.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(
      new THREE.LineSegments(
        grid,
        new THREE.LineBasicMaterial({ color: 0x27445a, transparent: true, opacity: 0.34 }),
      ),
    );

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(WALL * 2, TOP + 8.8)),
      new THREE.LineBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
      }),
    );
    border.position.set(0, (TOP - 8.8) / 2, -1);
    this.scene.add(border);
  }

  private buildBricks() {
    this.brickMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(BRICK_W, BRICK_H, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      COLS * ROWS,
    );
    this.brickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.brickMesh.frustumCulled = false;
    this.scene.add(this.brickMesh);

    this.brickGlow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.2,
      }),
      COLS * ROWS,
    );
    this.brickGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.brickGlow.frustumCulled = false;
    this.scene.add(this.brickGlow);
  }

  private buildPaddle() {
    const geo = new THREE.BoxGeometry(PADDLE_W, 0.3, 0.5);
    const bar = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: ACCENT,
        emissive: ACCENT,
        emissiveIntensity: 0.32,
        roughness: 0.3,
        metalness: 0.08,
      }),
    );
    bar.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xfff0b8, transparent: true, opacity: 0.5 }),
      ),
    );
    this.paddleGlow = glowSprite(ACCENT, 3.4);
    this.paddleGlow.material.opacity = 0.42;
    this.paddleGlow.position.z = -0.1;
    this.paddle.add(bar, this.paddleGlow);
    this.paddle.position.set(0, PADDLE_Y, 0.2);
    this.scene.add(this.paddle);
  }

  private buildBall() {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff8e0 }),
    );
    this.ballGlow = glowSprite(0xffe9a8, 1.4);
    this.ballGlow.material.opacity = 0.8;
    this.ballGlow.position.z = -0.1;
    this.ball.add(core, this.ballGlow);
    this.ball.position.copy(this.ballPos);
    this.scene.add(this.ball);
  }

  private buildWave() {
    this.bricks = [];
    const skip = Math.max(0, 0.12 - (this.wave - 1) * 0.02);
    const startX = -((COLS - 1) * STEP_X) / 2;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (this.rng() < skip) continue;
        this.bricks.push({
          x: startX + col * STEP_X,
          y: BRICK_TOP - row * STEP_Y,
          row,
          alive: true,
        });
      }
    }
    this.waveTotal = this.bricks.length;
    this.renderBricks();
  }

  private renderBricks() {
    let n = 0;
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const color = new THREE.Color(ROW_COLORS[brick.row]);
      this.dummy.position.set(brick.x, brick.y, 0);
      this.dummy.updateMatrix();
      this.brickMesh.setMatrixAt(n, this.dummy.matrix);
      this.brickMesh.setColorAt(n, color);

      this.dummy.position.set(brick.x, brick.y, -0.7);
      this.dummy.updateMatrix();
      this.brickGlow.setMatrixAt(n, this.dummy.matrix);
      this.brickGlow.setColorAt(n, color);
      n++;
    }
    this.brickMesh.count = n;
    this.brickMesh.instanceMatrix.needsUpdate = true;
    if (this.brickMesh.instanceColor) this.brickMesh.instanceColor.needsUpdate = true;
    this.brickGlow.count = n;
    this.brickGlow.instanceMatrix.needsUpdate = true;
    if (this.brickGlow.instanceColor) this.brickGlow.instanceColor.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- */

  private bindInput() {
    const el = this.renderer.domElement;

    this.listen<PointerEvent>(el, 'pointerdown', (e) => {
      if (this.mode !== 'play') return;
      el.setPointerCapture(e.pointerId);
      this.pointTo(e.clientX);
    });
    this.listen<PointerEvent>(el, 'pointermove', (e) => {
      if (this.mode !== 'play') return;
      if (e.pointerType === 'mouse' || el.hasPointerCapture(e.pointerId)) this.pointTo(e.clientX);
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
    this.targetX = clamp(n * this.halfW, -WALL + PADDLE_W / 2, WALL - PADDLE_W / 2);
  }

  /* ---------------------------------------------------------------- */

  protected reset() {
    this.mode = 'play';
    this.deadIn = 0;
    this.hudIn = 0;
    this.balls = 3;
    this.wave = 1;
    this.combo = 0;
    this.paddleX = 0;
    this.targetX = 0;
    this.keys.clear();
    this.paddle.position.x = 0;
    this.ball.visible = true;
    this.buildWave();
    this.spawnBall(0.8);
    this.ui.setMid(this.hudText(), 0);
    sfx.start();
  }

  protected update(dt: number) {
    const t = performance.now() * 0.001;

    if (this.mode === 'idle') {
      this.paddleX = Math.sin(t * 0.7) * 2.1;
      this.paddle.position.x = this.paddleX;
      this.ball.position.set(this.paddleX, PADDLE_Y + 0.55 + Math.sin(t * 2) * 0.12, 0.45);
      this.cam.position.x = Math.sin(t * 0.22) * 0.35;
      this.cam.lookAt(0, 0, 0);
      this.ballGlow.material.opacity = 0.7 + Math.sin(t * 3) * 0.15;
      return;
    }

    if (this.mode === 'play') {
      const dir =
        (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) -
        (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
      if (dir) this.targetX += dir * 11 * dt;
      this.targetX = clamp(this.targetX, -WALL + PADDLE_W / 2, WALL - PADDLE_W / 2);
      this.paddleX = damp(this.paddleX, this.targetX, 18, dt);
      this.paddle.position.x = this.paddleX;

      if (this.respawnIn > 0) {
        this.respawnIn -= dt;
        if (this.respawnIn <= 0) {
          this.ball.visible = true;
          this.ballStuck = true;
          this.launchIn = 0.55;
        }
      } else if (this.ballStuck) {
        this.ballPos.set(this.paddleX, PADDLE_Y + 0.55, 0.45);
        this.ball.position.copy(this.ballPos);
        this.launchIn -= dt;
        if (this.launchIn <= 0) this.launchBall();
      } else {
        this.moveBall(dt);
      }

      this.ballGlow.material.opacity = 0.72 + Math.sin(t * 9) * 0.18;
      this.paddleGlow.material.opacity = 0.4 + Math.sin(t * 4) * 0.08;

      this.hudIn -= dt;
      if (this.mode === 'play' && this.hudIn <= 0) {
        this.hudIn = 0.1;
        this.ui.setMid(this.hudText(), this.remainingBricks());
      }
    } else if (this.mode === 'dead') {
      this.deadIn -= dt;
      if (this.deadIn <= 0) {
        this.mode = 'over';
        this.finish();
      }
    }
  }

  private hudText() {
    return `LV ${this.wave} · BOLA ${Math.max(0, this.balls)}`;
  }

  private remainingBricks() {
    let alive = 0;
    for (const brick of this.bricks) if (brick.alive) alive++;
    return 1 - alive / Math.max(1, this.waveTotal);
  }

  private ballSpeed() {
    return 9.8 + this.wave * 0.5 + (3 - this.balls) * 0.3;
  }

  private spawnBall(startDelay: number) {
    this.ballStuck = true;
    this.launchIn = startDelay;
    this.respawnIn = 0;
    this.ballVel.set(0, 0);
    this.ball.visible = true;
    this.ballPos.set(this.paddleX, PADDLE_Y + 0.55, 0.45);
    this.ball.position.copy(this.ballPos);
  }

  private launchBall() {
    this.ballStuck = false;
    const angle = (this.rng() < 0.5 ? -1 : 1) * (0.3 + this.rng() * 0.32);
    const speed = this.ballSpeed();
    this.ballVel.set(Math.sin(angle) * speed, Math.cos(angle) * speed);
    sfx.tick();
  }

  private moveBall(dt: number) {
    const dist = this.ballVel.length() * dt;
    const steps = Math.min(8, Math.max(1, Math.ceil(dist / 0.14)));
    const step = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.ballPos.x += this.ballVel.x * step;
      this.ballPos.y += this.ballVel.y * step;

      this.collideWalls();
      if (this.collideBricks()) {
        this.ball.position.copy(this.ballPos);
        return;
      }
      this.collidePaddle();
      if (this.ballPos.y < -9.2) {
        this.loseBall();
        return;
      }
    }
    this.ball.position.copy(this.ballPos);
  }

  private collideWalls() {
    const minX = -WALL + BALL_R;
    const maxX = WALL - BALL_R;
    if (this.ballPos.x < minX) {
      this.ballPos.x = minX;
      this.ballVel.x = Math.abs(this.ballVel.x);
    } else if (this.ballPos.x > maxX) {
      this.ballPos.x = maxX;
      this.ballVel.x = -Math.abs(this.ballVel.x);
    }
    if (this.ballPos.y > TOP - BALL_R) {
      this.ballPos.y = TOP - BALL_R;
      this.ballVel.y = -Math.abs(this.ballVel.y);
    }
  }

  private collideBricks() {
    const hw = BRICK_W / 2 + BALL_R;
    const hh = BRICK_H / 2 + BALL_R;

    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const dx = this.ballPos.x - brick.x;
      const dy = this.ballPos.y - brick.y;
      if (Math.abs(dx) >= hw || Math.abs(dy) >= hh) continue;

      if (hw - Math.abs(dx) < hh - Math.abs(dy)) {
        this.ballVel.x = (dx >= 0 ? 1 : -1) * Math.abs(this.ballVel.x);
        this.ballPos.x = brick.x + (dx >= 0 ? hw : -hw);
      } else {
        this.ballVel.y = (dy >= 0 ? 1 : -1) * Math.abs(this.ballVel.y);
        this.ballPos.y = brick.y + (dy >= 0 ? hh : -hh);
      }
      this.hitBrick(brick);
      return true;
    }
    return false;
  }

  private collidePaddle() {
    if (this.ballVel.y >= 0) return;
    const top = PADDLE_Y + 0.15;
    if (this.ballPos.y - BALL_R > top || this.ballPos.y < PADDLE_Y - 0.55) return;
    const half = PADDLE_W / 2 + BALL_R;
    if (Math.abs(this.ballPos.x - this.paddleX) > half) return;

    const n = clamp((this.ballPos.x - this.paddleX) / half, -1, 1);
    const speed = Math.max(9, this.ballVel.length());
    const angle = n * 1.05;
    this.ballVel.set(Math.sin(angle) * speed, Math.cos(angle) * speed);
    this.ballPos.y = top + BALL_R;
    this.combo = 0;
    sfx.gate();
    this.particles.spawn(new THREE.Vector3(this.ballPos.x, PADDLE_Y + 0.3, 0.5), ACCENT, 5, 2.2, 0.25);
  }

  private hitBrick(brick: Brick) {
    brick.alive = false;
    this.combo++;
    const gain = (10 + Math.min(this.combo, 10) * 2) * this.wave;
    this.score += gain;
    this.ui.setScore(this.score, true);

    this.particles.spawn(
      new THREE.Vector3(brick.x, brick.y, 0.5),
      ROW_COLORS[brick.row],
      12,
      3.4,
      0.5,
    );
    sfx.smash(this.combo);
    this.renderBricks();

    if (this.bricks.every((b) => !b.alive)) this.clearWave();
  }

  private clearWave() {
    const bonus = 150 * this.wave;
    this.score += bonus;
    this.ui.setScore(this.score, true);
    this.ui.float(`LEVEL ${this.wave} CLEAR +${bonus}`, window.innerWidth / 2, window.innerHeight * 0.34, 'gold');
    sfx.gold();

    this.wave++;
    this.buildWave();
    this.spawnBall(0.6);
    this.ui.setMid(this.hudText(), 0);
  }

  private loseBall() {
    this.balls--;
    this.ball.visible = false;
    this.ballStuck = true;
    this.ballVel.set(0, 0);
    this.combo = 0;
    this.ui.shake();
    this.ui.flash('#ff5c7a');
    this.particles.spawn(new THREE.Vector3(this.ballPos.x, -8.4, 0.5), 0xff5c7a, 22, 4.5);
    sfx.died();
    this.ui.setMid(this.hudText(), this.remainingBricks());

    if (this.balls <= 0) {
      this.end();
      return;
    }
    this.respawnIn = 0.85;
  }

  private end() {
    if (this.mode !== 'play') return;
    this.mode = 'dead';
    this.deadIn = 0.85;
    this.ui.setMid('');
    this.ball.visible = false;
  }

  protected onResize(width: number, height: number) {
    const aspect = width / height;
    const halfH = Math.max(9.4, 5.9 / aspect);
    this.halfW = halfH * aspect;
    this.cam.left = -this.halfW;
    this.cam.right = this.halfW;
    this.cam.top = halfH;
    this.cam.bottom = -halfH;
    this.cam.updateProjectionMatrix();
    this.targetX = clamp(this.targetX, -WALL + PADDLE_W / 2, WALL - PADDLE_W / 2);
  }
}
