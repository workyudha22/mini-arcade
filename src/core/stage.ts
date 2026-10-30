import * as THREE from 'three';
import { formatScore, mulberry32 } from './util';

/* ------------------------------------------------------------------ */
/* particles                                                           */
/* ------------------------------------------------------------------ */

const PARTICLE_MAX = 180;

const PARTICLE_VERT = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (0.55 + aAlpha * 0.6) * (260.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.04, d) * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }
`;

export class ParticleBurst {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private cursor = 0;
  private geometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(PARTICLE_MAX * 3);
    this.col = new Float32Array(PARTICLE_MAX * 3);
    this.alpha = new Float32Array(PARTICLE_MAX);
    this.size = new Float32Array(PARTICLE_MAX);
    this.vel = new Float32Array(PARTICLE_MAX * 3);
    this.life = new Float32Array(PARTICLE_MAX);
    this.maxLife = new Float32Array(PARTICLE_MAX).fill(1);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(origin: THREE.Vector3, color: THREE.ColorRepresentation, count = 18, speed = 4, spread = 0.15) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % PARTICLE_MAX;
      const i3 = idx * 3;

      this.pos[i3] = origin.x + (Math.random() - 0.5) * spread;
      this.pos[i3 + 1] = origin.y + (Math.random() - 0.5) * spread;
      this.pos[i3 + 2] = origin.z + (Math.random() - 0.5) * spread;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.35 + Math.random() * 0.65);
      this.vel[i3] = Math.sin(phi) * Math.cos(theta) * v;
      this.vel[i3 + 1] = Math.cos(phi) * v;
      this.vel[i3 + 2] = Math.sin(phi) * Math.sin(theta) * v;

      this.col[i3] = c.r;
      this.col[i3 + 1] = c.g;
      this.col[i3 + 2] = c.b;

      const ttl = 0.45 + Math.random() * 0.6;
      this.life[idx] = ttl;
      this.maxLife[idx] = ttl;
      this.alpha[idx] = 1;
      this.size[idx] = 0.5 + Math.random() * 0.9;
    }
  }

  update(dt: number) {
    const drag = Math.exp(-1.8 * dt);
    for (let i = 0; i < PARTICLE_MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vel[i3] *= drag;
      this.vel[i3 + 1] *= drag;
      this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.alpha[i] = Math.max(0, this.life[i] / this.maxLife[i]);
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* shared glow sprite                                                  */
/* ------------------------------------------------------------------ */

let glow: THREE.CanvasTexture | null = null;

export function glowTexture() {
  if (glow) return glow;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

export function glowSprite(color: THREE.ColorRepresentation, scale: number) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sprite.scale.setScalar(scale);
  return sprite;
}

/* ------------------------------------------------------------------ */
/* stage UI                                                            */
/* ------------------------------------------------------------------ */

export interface OverlaySpec {
  eyebrow: string;
  title: string;
  desc: string;
  button: string;
  hint?: string;
  result?: { score: number; best: number; record: boolean };
}

const $ = <T extends HTMLElement>(id: string, root: ParentNode = document) => {
  const el = root.querySelector<T>(`#${id}`);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

export class StageUI {
  readonly primary: HTMLButtonElement;
  private root: HTMLElement;
  private host: HTMLElement;
  private scoreEl: HTMLElement;
  private bestEl: HTMLElement;
  private midLabel: HTMLElement;
  private meter: HTMLElement;
  private meterFill: HTMLElement;
  private overlayEl: HTMLElement;
  private eyebrow: HTMLElement;
  private title: HTMLElement;
  private desc: HTMLElement;
  private result: HTMLElement;
  private hint: HTMLElement;
  private fx: HTMLElement;

  constructor(root: HTMLElement, host: HTMLElement) {
    this.root = root;
    this.host = host;
    this.scoreEl = $('score', root);
    this.bestEl = $('best', root);
    this.midLabel = $('mid-label', root);
    this.meter = $('meter', root);
    this.meterFill = $('meter-fill', root);
    this.overlayEl = $('overlay', root);
    this.eyebrow = $('ov-eyebrow', root);
    this.title = $('ov-title', root);
    this.desc = $('ov-desc', root);
    this.result = $('ov-result', root);
    this.hint = $('ov-hint', root);
    this.fx = $('fx', root);
    this.primary = $<HTMLButtonElement>('ov-btn', root);
  }

  setAccent(color: string) {
    this.root.style.setProperty('--accent', color);
  }

  setScore(value: number, bump = false) {
    this.scoreEl.textContent = formatScore(value);
    if (!bump) return;
    this.scoreEl.classList.remove('bump');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('bump');
  }

  setBest(value: number) {
    this.bestEl.textContent = formatScore(value);
  }

  setMid(label: string, ratio?: number | null) {
    this.midLabel.textContent = label;
    const show = ratio !== undefined && ratio !== null;
    this.meter.hidden = !show;
    if (show) this.meterFill.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
  }

  showOverlay(spec: OverlaySpec) {
    this.eyebrow.textContent = spec.eyebrow;
    this.title.textContent = spec.title;
    this.desc.textContent = spec.desc;
    this.hint.textContent = spec.hint ?? '';

    if (spec.result) {
      const { score, best, record } = spec.result;
      this.result.innerHTML = '';
      const meta = document.createElement('span');
      meta.textContent = 'SKOR KAMU';
      const big = document.createElement('strong');
      big.textContent = formatScore(score);
      const sub = document.createElement('em');
      sub.className = record ? 'is-record' : '';
      sub.textContent = record ? 'REKOR BARU' : `BEST ${formatScore(best)}`;
      this.result.append(meta, big, sub);
      this.result.hidden = false;
    } else {
      this.result.hidden = true;
    }

    this.primary.textContent = spec.button;
    this.overlayEl.hidden = false;
    requestAnimationFrame(() => this.primary.focus({ preventScroll: true }));
  }

  hideOverlay() {
    this.overlayEl.hidden = true;
  }

  get overlayOpen() {
    return !this.overlayEl.hidden;
  }

  shake(power = 1) {
    this.host.classList.remove('shake');
    void this.host.offsetWidth;
    this.host.style.setProperty('--shake', String(power));
    this.host.classList.add('shake');
  }

  flash(tone = '#ff4d7a') {
    const div = document.createElement('div');
    div.className = 'flash';
    div.style.background = tone;
    this.fx.appendChild(div);
    window.setTimeout(() => div.remove(), 480);
  }

  float(text: string, x: number, y: number, tone: 'good' | 'bad' | 'gold' = 'good') {
    const span = document.createElement('span');
    span.className = `float-text${tone === 'good' ? '' : ` ${tone}`}`;
    span.textContent = text;
    span.style.left = `${x}px`;
    span.style.top = `${y}px`;
    this.fx.appendChild(span);
    window.setTimeout(() => span.remove(), 1000);
  }

  clearFx() {
    this.fx.innerHTML = '';
  }
}

/* ------------------------------------------------------------------ */
/* base game                                                           */
/* ------------------------------------------------------------------ */

export abstract class BaseGame {
  protected readonly scene = new THREE.Scene();
  protected camera!: THREE.Camera;
  protected readonly renderer: THREE.WebGLRenderer;
  protected readonly particles: ParticleBurst;
  protected score = 0;
  /** Gameplay randomness. Replaced by a seeded PRNG for daily runs. */
  protected rng: () => number = Math.random;
  onOver: ((score: number) => void) | null = null;

  private readonly timer = new THREE.Timer();
  private raf = 0;
  private paused = false;
  private ro: ResizeObserver | null = null;
  private cleanups: Array<() => void> = [];

  constructor(
    protected readonly host: HTMLElement,
    protected readonly ui: StageUI,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.host.appendChild(this.renderer.domElement);
    this.particles = new ParticleBurst(this.scene);
    this.timer.connect(document);
    this.listen(document, 'visibilitychange', this.onVisibility);
  }

  protected abstract reset(): void;
  protected abstract update(dt: number): void;

  /** Called by subclasses once their scene is built. */
  protected mount() {
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.host);
    this.resize();
    this.timer.reset();
    this.loop();
  }

  /** Seed gameplay randomness. Call before `begin()`; undefined restores Math.random. */
  setSeed(seed?: number) {
    this.rng = seed === undefined ? Math.random : mulberry32(seed);
  }

  begin() {
    this.score = 0;
    this.ui.setScore(0);
    this.ui.setMid('');
    this.ui.clearFx();
    this.timer.reset();
    this.reset();
  }

  protected finish() {
    this.onOver?.(this.score);
  }

  protected onResize(_width: number, _height: number) {
    /* default noop */
  }

  protected listen<E extends Event = Event>(
    target: EventTarget,
    type: string,
    handler: (event: E) => void,
    options?: AddEventListenerOptions,
  ) {
    const fn = handler as EventListener;
    target.addEventListener(type, fn, options);
    this.cleanups.push(() => target.removeEventListener(type, fn, options));
  }

  private onVisibility = () => {
    this.paused = document.hidden;
    if (!this.paused) this.timer.reset();
  };

  private resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.onResize(width, height);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    if (!this.paused) {
      this.update(dt);
      this.particles.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.timer.disconnect();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const mat of mats) {
        for (const key of ['map', 'alphaMap', 'emissiveMap', 'normalMap'] as const) {
          const value = (mat as unknown as Record<string, unknown>)[key];
          if (value instanceof THREE.Texture) value.dispose();
        }
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
