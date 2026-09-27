import * as THREE from 'three';
import { glowTex } from '../world/textures';

const MAX = 900;

/** Pooled additive particles, one draw call for everything. */
export class Particles {
  points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private cursor = 0;
  private mat: THREE.ShaderMaterial;
  private rings: { mesh: THREE.Mesh; t: number; dur: number; maxR: number }[] = [];

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: glowTex() }, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float uScale; varying vec3 vC; varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vC = color; vA = alpha;
          gl_PointSize = alpha > 0.001 ? size * uScale / -mv.z : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; varying vec3 vC; varying float vA;
        void main(){
          float a = texture2D(uTex, gl_PointCoord).r * vA;
          gl_FragColor = vec4(vC * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe080', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringMat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, t: 0, dur: 1, maxR: 1 });
    }
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, grav = 0, drag = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  burst(p: THREE.Vector3, color: THREE.Color | string, count: number, speed = 3, size = 0.35, life = 0.8, grav = -2) {
    const c = typeof color === 'string' ? new THREE.Color(color) : color;
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit(p.x, p.y, p.z, r * Math.cos(th) * s, u * s + speed * 0.3, r * Math.sin(th) * s, c, size * (0.6 + Math.random() * 0.6), life * (0.6 + Math.random() * 0.6), grav, 1.5);
    }
  }

  /** Particle that travels from `from` to `to` over `life` seconds. */
  stream(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, size: number, life: number) {
    this.emit(from.x, from.y, from.z, (to.x - from.x) / life, (to.y - from.y) / life, (to.z - from.z) / life, color, size, life);
  }

  ring(p: THREE.Vector3, color: string, maxR: number, dur: number) {
    const r = this.rings.find((x) => !x.mesh.visible) ?? this.rings[0];
    r.mesh.position.set(p.x, 0.08, p.z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    r.t = 0;
    r.dur = dur;
    r.maxR = maxR;
    r.mesh.visible = true;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewportH: number) {
    this.mat.uniforms.uScale.value = viewportH * 0.5 * camera.projectionMatrix.elements[5];
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 2] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr + this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, k * 2.5);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      r.mesh.scale.setScalar(0.1 + e * r.maxR);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }
  }
}
