import * as THREE from 'three';
import { BaseGame, glowSprite, type StageUI } from '../core/stage';
import { sfx } from '../core/audio';


type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
type Matrix = number[][];
type Mode = 'idle' | 'play' | 'dead' | 'over';

const COLS = 10;
const ROWS = 18;
const TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const ACCENT = 0x7ef2b0;

const SHAPES: Record<PieceType, Matrix> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  T: [
    [0, 1, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  S: [
    [0, 1, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  Z: [
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  L: [
    [0, 0, 1, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
};

const COLORS: Record<PieceType, number> = {
  I: 0x4ee1ff,
  O: 0xffd166,
  T: 0xa78bfa,
  S: 0x7ef2b0,
  Z: 0xff5c7a,
  J: 0x60a5fa,
  L: 0xffa14e,
};

interface Piece {
  type: PieceType;
  matrix: Matrix;
  x: number;
  y: number;
}

function rotateCW(m: Matrix): Matrix {
  const out: Matrix = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (m[r][c]) out[c][3 - r] = 1;
    }
  }
  return out;
}

export class BlockfallGame extends BaseGame {
  private cam: THREE.OrthographicCamera;
  private board = new Uint8Array(COLS * ROWS);
  private piece: Piece | null = null;
  private nextType: PieceType = 'T';
  private bag: PieceType[] = [];
  private mode: Mode = 'idle';
  private deadIn = 0;
  private lines = 0;
  private level = 1;
  private dropIn = 0;
  private moveIn = 0;
  private hudIn = 0;

  private locked: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private blockGeo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
  private edgeGeo = new THREE.EdgesGeometry(this.blockGeo);
  private edgeMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.34,
  });
  private mats = {} as Record<PieceType, THREE.MeshStandardMaterial>;
  private ghostMats = {} as Record<PieceType, THREE.MeshBasicMaterial>;
  private colors = {} as Record<PieceType, THREE.Color>;

  private activeGroup = new THREE.Group();
  private ghostGroup = new THREE.Group();
  private nextGroup = new THREE.Group();
  private activeMeshes: THREE.Mesh[] = [];
  private ghostMeshes: THREE.Mesh[] = [];
  private nextMeshes: THREE.Mesh[] = [];
  private nextPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 3),
    new THREE.MeshBasicMaterial({ color: 0x080b14, transparent: true, opacity: 0.88 }),
  );
  private nextFrame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(4.8, 3)),
    new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.42 }),
  );

  private drag: { id: number; x: number; y: number; lastX: number; time: number; moved: boolean } | null =
    null;
  private keys = new Set<string>();

  constructor(host: HTMLElement, ui: StageUI) {
    super(host, ui);

    this.cam = new THREE.OrthographicCamera(-6, 6, 11, -11, 0.1, 80);
    this.cam.position.set(0, 2.6, 26);
    this.cam.lookAt(0, -0.4, 0);
    this.camera = this.cam;

    this.scene.add(new THREE.HemisphereLight(0xa8c4ff, 0x080a12, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(5, 12, 9);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(ACCENT, 1.2);
    rim.position.set(-8, 3, -5);
    this.scene.add(rim);

    for (const type of TYPES) {
      const color = COLORS[type];
      this.colors[type] = new THREE.Color(color);
      this.mats[type] = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.34,
        roughness: 0.34,
        metalness: 0.04,
      });
      this.ghostMats[type] = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      });
    }

    this.buildBoard();
    this.locked = this.buildLocked();
    this.buildPieces();
    this.updatePreview();
    this.bindInput();
    this.mount();
  }

  /* ---------------------------------------------------------------- */

  private buildBoard() {
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS, ROWS),
      new THREE.MeshBasicMaterial({ color: 0x080b14, transparent: true, opacity: 0.92 }),
    );
    bg.position.z = -0.7;
    this.scene.add(bg);

    const pts: number[] = [];
    for (let x = 0; x <= COLS; x++) {
      const px = x - COLS / 2;
      pts.push(px, -ROWS / 2, -0.55, px, ROWS / 2, -0.55);
    }
    for (let y = 0; y <= ROWS; y++) {
      const py = y - ROWS / 2;
      pts.push(-COLS / 2, py, -0.55, COLS / 2, py, -0.55);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(
      new THREE.LineSegments(
        gridGeo,
        new THREE.LineBasicMaterial({
          color: 0x27445a,
          transparent: true,
          opacity: 0.55,
        }),
      ),
    );

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(COLS, ROWS)),
      new THREE.LineBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
      }),
    );
    border.position.z = -0.5;
    this.scene.add(border);

    const halo = glowSprite(ACCENT, 18);
    halo.position.z = -2.5;
    halo.material.opacity = 0.07;
    this.scene.add(halo);
  }

  private buildLocked() {
    const mesh = new THREE.InstancedMesh(
      this.blockGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      COLS * ROWS,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.setColorAt(0, new THREE.Color(0xffffff));
    this.scene.add(mesh);
    return mesh;
  }

  private buildPieces() {
    for (let i = 0; i < 4; i++) {
      const active = new THREE.Mesh(this.blockGeo, this.mats.T);
      active.add(new THREE.LineSegments(this.edgeGeo, this.edgeMat));
      this.activeGroup.add(active);
      this.activeMeshes.push(active);

      const ghost = new THREE.Mesh(this.blockGeo, this.ghostMats.T);
      this.ghostGroup.add(ghost);
      this.ghostMeshes.push(ghost);

      const next = new THREE.Mesh(this.blockGeo, this.mats.T);
      next.add(new THREE.LineSegments(this.edgeGeo, this.edgeMat));
      this.nextGroup.add(next);
      this.nextMeshes.push(next);
    }
    this.nextPanel.position.z = -0.45;
    this.nextFrame.position.z = -0.4;
    this.nextGroup.add(this.nextPanel, this.nextFrame);
    this.nextGroup.position.set(7.7, 5.4, 0);
    this.scene.add(this.activeGroup, this.ghostGroup, this.nextGroup);
  }

  private bindInput() {
    const el = this.renderer.domElement;

    this.listen<PointerEvent>(el, 'pointerdown', (e) => {
      if (this.mode !== 'play') return;
      el.setPointerCapture(e.pointerId);
      this.drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        time: performance.now(),
        moved: false,
      };
    });

    this.listen<PointerEvent>(el, 'pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.lastX;
      if (Math.abs(dx) < 24) return;
      const steps = Math.trunc(dx / 24);
      this.move(steps, 0);
      this.drag.lastX += steps * 24;
      this.drag.moved = true;
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      const quick = performance.now() - this.drag.time < 450;
      if (dy > 60 && Math.abs(dx) < 60 && quick) this.hardDrop();
      else if (!this.drag.moved && Math.abs(dx) < 14 && Math.abs(dy) < 14) this.rotate();
      this.drag = null;
    };
    this.listen(el, 'pointerup', endDrag);
    this.listen(el, 'pointercancel', endDrag);

    this.listen<KeyboardEvent>(window, 'keydown', (e) => {
      if (this.mode !== 'play') return;
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault();
          this.keys.add(e.code);
          break;
        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault();
          this.keys.add(e.code);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.move(0, -1);
          break;
        case 'ArrowUp':
        case 'KeyX':
        case 'KeyW':
          e.preventDefault();
          this.rotate();
          break;
        case 'Space':
          e.preventDefault();
          this.hardDrop();
          break;
      }
    });
    this.listen<KeyboardEvent>(window, 'keyup', (e) => this.keys.delete(e.code));
  }

  /* ---------------------------------------------------------------- */

  private pull(): PieceType {
    if (!this.bag.length) {
      this.bag = [...TYPES];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  private dropInterval() {
    return Math.max(0.16, 0.85 - (this.level - 1) * 0.07);
  }

  private cells(matrix = this.piece?.matrix, px = this.piece?.x ?? 0, py = this.piece?.y ?? 0) {
    const out: Array<{ x: number; y: number }> = [];
    if (!matrix) return out;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (matrix[r][c]) out.push({ x: px + c, y: py + (3 - r) });
      }
    }
    return out;
  }

  private blocked(matrix: Matrix, px: number, py: number) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!matrix[r][c]) continue;
        const x = px + c;
        const y = py + (3 - r);
        if (x < 0 || x >= COLS || y < 0) return true;
        if (y < ROWS && this.board[y * COLS + x]) return true;
      }
    }
    return false;
  }

  private spawnPiece(type: PieceType) {
    this.piece = {
      type,
      matrix: SHAPES[type].map((row) => [...row]),
      x: 3,
      y: ROWS - 4,
    };
    if (this.blocked(this.piece.matrix, this.piece.x, this.piece.y)) {
      this.topOut();
      return;
    }
    this.dropIn = this.dropInterval();
    this.syncPiece();
  }

  private syncPiece() {
    const piece = this.piece;
    if (!piece) return;

    const cells = this.cells();
    const ghostY = this.ghostY();
    for (let i = 0; i < 4; i++) {
      const active = this.activeMeshes[i];
      const ghost = this.ghostMeshes[i];
      const cell = cells[i];
      if (!cell) {
        active.visible = false;
        ghost.visible = false;
        continue;
      }
      active.visible = true;
      active.material = this.mats[piece.type];
      active.position.set(cell.x - COLS / 2 + 0.5, cell.y - ROWS / 2 + 0.5, 0.3);

      ghost.visible = true;
      ghost.material = this.ghostMats[piece.type];
      ghost.position.set(
        cell.x - COLS / 2 + 0.5,
        cell.y - ROWS / 2 + 0.5 + ghostY,
        0.15,
      );
    }
  }

  private ghostY() {
    if (!this.piece) return 0;
    let drop = 0;
    while (!this.blocked(this.piece.matrix, this.piece.x, this.piece.y - drop - 1)) drop++;
    return -drop;
  }

  private updatePreview() {
    const cells: Array<{ x: number; y: number }> = [];
    const matrix = SHAPES[this.nextType];
    let minX = 4;
    let maxX = 0;
    let minY = 4;
    let maxY = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!matrix[r][c]) continue;
        const y = 3 - r;
        cells.push({ x: c, y });
        minX = Math.min(minX, c);
        maxX = Math.max(maxX, c);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    for (let i = 0; i < 4; i++) {
      const mesh = this.nextMeshes[i];
      const cell = cells[i];
      if (!cell) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.material = this.mats[this.nextType];
      mesh.position.set((cell.x - midX) * 1.0, (cell.y - midY) * 1.0, 0);
    }
  }

  /* ---------------------------------------------------------------- */

  protected reset() {
    this.mode = 'play';
    this.deadIn = 0;
    this.lines = 0;
    this.level = 1;
    this.dropIn = 0;
    this.moveIn = 0;
    this.hudIn = 0;
    this.keys.clear();
    this.drag = null;
    this.board.fill(0);
    this.renderBoard();

    this.bag = [];
    const first = this.pull();
    this.nextType = this.pull();
    this.updatePreview();
    this.spawnPiece(first);

    this.cam.position.set(0, 2.6, 26);
    this.cam.lookAt(0, -0.4, 0);
    this.ui.setMid(this.hudText(), 0);
    sfx.start();
  }

  protected update(dt: number) {
    const t = performance.now() * 0.001;

    if (this.mode === 'idle') {
      this.cam.position.x = Math.sin(t * 0.22) * 0.8;
      this.cam.lookAt(0, -0.4, 0);
      return;
    }

    if (this.mode === 'play' && this.piece) {
      const dir =
        (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) -
        (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
      this.moveIn -= dt;
      if (dir && this.moveIn <= 0) {
        this.move(dir, 0);
        this.moveIn = 0.09;
      }

      this.dropIn -= dt;
      if (this.dropIn <= 0) {
        this.dropIn = this.dropInterval();
        if (!this.move(0, -1)) this.lock();
      }

      this.hudIn -= dt;
      if (this.mode === 'play' && this.hudIn <= 0) {
        this.hudIn = 0.1;
        this.ui.setMid(this.hudText(), (this.lines % 5) / 5);
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
    return `LV ${this.level} · ${this.lines} BARIS`;
  }

  private move(dx: number, dy: number) {
    if (!this.piece || this.mode !== 'play') return false;
    if (this.blocked(this.piece.matrix, this.piece.x + dx, this.piece.y + dy)) return false;
    this.piece.x += dx;
    this.piece.y += dy;
    this.syncPiece();
    return true;
  }

  private rotate() {
    if (!this.piece || this.mode !== 'play' || this.piece.type === 'O') return;
    const matrix = rotateCW(this.piece.matrix);
    const kicks: Array<[number, number]> = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [-2, 0],
      [2, 0],
      [0, 1],
    ];
    for (const [dx, dy] of kicks) {
      if (!this.blocked(matrix, this.piece.x + dx, this.piece.y + dy)) {
        this.piece.matrix = matrix;
        this.piece.x += dx;
        this.piece.y += dy;
        this.syncPiece();
        sfx.gate();
        return;
      }
    }
  }

  private hardDrop() {
    if (!this.piece || this.mode !== 'play') return;
    let cells = 0;
    while (this.move(0, -1)) cells++;
    if (cells > 0) {
      this.score += cells * 2 * this.level;
      this.ui.setScore(this.score, true);
    }
    this.lock();
  }

  private lock() {
    if (!this.piece || this.mode !== 'play') return;
    const type = this.piece.type;
    const value = TYPES.indexOf(type) + 1;
    for (const cell of this.cells()) {
      if (cell.y >= 0 && cell.y < ROWS && cell.x >= 0 && cell.x < COLS) {
        this.board[cell.y * COLS + cell.x] = value;
      }
    }

    const center = new THREE.Vector3(
      this.piece.x - COLS / 2 + 1,
      this.piece.y - ROWS / 2 + 1,
      0.5,
    );
    this.particles.spawn(center, COLORS[type], 10, 2.6, 0.7);
    sfx.place();

    this.piece = null;
    this.activeMeshes.forEach((m) => (m.visible = false));
    this.ghostMeshes.forEach((m) => (m.visible = false));

    this.clearLines();
    this.renderBoard();

    const next = this.nextType;
    this.nextType = this.pull();
    this.updatePreview();
    this.spawnPiece(next);
  }

  private clearLines() {
    let cleared = 0;
    for (let y = 0; y < ROWS; y++) {
      let full = true;
      for (let x = 0; x < COLS; x++) {
        if (!this.board[y * COLS + x]) {
          full = false;
          break;
        }
      }
      if (!full) continue;

      for (const px of [-3.5, -1.5, 0.5, 2.5]) {
        this.particles.spawn(new THREE.Vector3(px, y - ROWS / 2 + 0.5, 0.4), ACCENT, 7, 3.2, 0.4);
      }
      this.board.copyWithin(y * COLS, (y + 1) * COLS, ROWS * COLS);
      this.board.fill(0, (ROWS - 1) * COLS);
      cleared++;
      y--;
    }

    if (!cleared) return;

    const gain = [0, 100, 300, 500, 800][Math.min(4, cleared)] * this.level;
    this.lines += cleared;
    this.level = 1 + Math.floor(this.lines / 5);
    this.score += gain;
    this.ui.setScore(this.score, true);
    this.ui.float(
      `${cleared === 4 ? 'TETRIS' : cleared === 3 ? 'TRIPLE' : cleared === 2 ? 'DOUBLE' : 'SINGLE'} +${gain}`,
      window.innerWidth / 2,
      window.innerHeight * 0.36,
      cleared >= 3 ? 'gold' : 'good',
    );
    if (cleared >= 4) {
      this.ui.shake(0.8);
      this.ui.flash('#7ef2b0');
    }
    sfx.clear(cleared);
  }

  private renderBoard() {
    let n = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const value = this.board[y * COLS + x];
        if (!value) continue;
        const type = TYPES[value - 1];
        this.dummy.position.set(x - COLS / 2 + 0.5, y - ROWS / 2 + 0.5, 0);
        this.dummy.updateMatrix();
        this.locked.setMatrixAt(n, this.dummy.matrix);
        this.locked.setColorAt(n, this.colors[type]);
        n++;
      }
    }
    this.locked.count = n;
    this.locked.instanceMatrix.needsUpdate = true;
    if (this.locked.instanceColor) this.locked.instanceColor.needsUpdate = true;
  }

  private topOut() {
    if (this.mode !== 'play') return;
    this.mode = 'dead';
    this.deadIn = 0.9;
    this.piece = null;
    this.activeMeshes.forEach((m) => (m.visible = false));
    this.ghostMeshes.forEach((m) => (m.visible = false));
    this.ui.setMid('');
    this.ui.shake();
    this.ui.flash('#7ef2b0');
    sfx.died();
    this.particles.spawn(new THREE.Vector3(0, 2, 0.5), ACCENT, 34, 6);
  }

  protected onResize(width: number, height: number) {
    const aspect = width / height;
    let halfH = Math.max(11, 6 / aspect);
    // Portrait screens have no side margin; reserve headroom above the board
    // so the next-piece preview fits instead of disappearing.
    if (halfH * aspect < 9.6) halfH = Math.max(halfH, 12.4);
    const halfW = halfH * aspect;
    this.cam.left = -halfW;
    this.cam.right = halfW;
    this.cam.top = halfH;
    this.cam.bottom = -halfH;
    this.cam.updateProjectionMatrix();

    const side = halfW >= 9.6;
    this.nextGroup.scale.setScalar(side ? 1 : 0.72);
    this.nextGroup.position.set(side ? 7.7 : 0, side ? 5.4 : -10.3, 0);
    this.nextGroup.visible = true;
  }
}
