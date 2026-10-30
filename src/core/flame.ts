import * as THREE from 'three';
import { glowTexture } from './stage';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    float y = vUv.y;
    float x = (vUv.x - 0.5) * 2.0;
    x -= sin(uTime * 2.4 + y * 6.0) * 0.22 * y * y;

    float width = 0.66 * pow(max(0.0, 1.0 - y), 0.8);
    width *= 0.92 + 0.08 * sin(y * 9.0 - uTime * 5.0);

    float body = smoothstep(0.06, -0.04, abs(x) - width);
    body *= smoothstep(0.0, 0.12, y);

    float core = smoothstep(0.34, 0.0, abs(x) * 1.6)
      * smoothstep(0.8, 0.05, y)
      * smoothstep(0.02, 0.2, y);

    vec3 outer = vec3(1.0, 0.2, 0.02);
    vec3 inner = vec3(1.0, 0.84, 0.3);
    vec3 color = mix(outer, inner, core);

    if (body < 0.01) discard;
    gl_FragColor = vec4(color, body);
  }
`;

/** Tiny Three.js flame used as the daily streak icon. */
export class StreakFlame {
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 4);
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly glow: THREE.Sprite;
  private readonly ro: ResizeObserver;
  private raf = 0;
  private last = performance.now();
  private time = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.host.appendChild(this.renderer.domElement);

    this.camera.position.z = 1;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.scale.setScalar(0.86);
    this.scene.add(this.mesh);

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0xff7a1a,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.glow.scale.setScalar(1.02);
    this.glow.position.z = -0.1;
    this.scene.add(this.glow);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.loop();
  }

  private resize() {
    const size = Math.max(1, this.host.clientWidth || 16);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(size, size, false);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.host.isConnected || !this.host.offsetParent) return;

    const now = performance.now();
    this.time += Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    this.material.uniforms.uTime.value = this.time;
    this.mesh.scale.setScalar(0.86 + Math.sin(this.time * 4.2) * 0.03);
    this.glow.material.opacity = 0.42 + Math.sin(this.time * 3.1) * 0.12;
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.glow.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
