import * as THREE from 'three';
import { makeNate, animateHumanoid, type NateModel } from './models';
import type { Grid } from '../world/layout';
import type { Input } from '../input';

export const BEAM_RANGE = 8.5;
export const BEAM_HALF_ANGLE = 0.4; // radians, for gameplay test (slightly wider than it looks = forgiving)

export class Nate {
  model: NateModel;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  facing = Math.PI; // radians; 0 = +z (south)
  dir = new THREE.Vector3(0, 0, -1);
  phase = 0;
  vacuuming = false;
  stunT = 0;
  spot: THREE.SpotLight;
  beam: THREE.Mesh;
  beamMat: THREE.ShaderMaterial;
  nozzleWorld = new THREE.Vector3();
  aura: THREE.PointLight;
  moveSpeed = 5.2;
  stepAcc = 0;
  onStep?: () => void;
  flashlightPower = 1;

  constructor(scene: THREE.Scene, shadows: boolean, shadowSize: number) {
    this.model = makeNate();
    scene.add(this.model.root);
    // right arm holds the wand out in front
    this.model.wand.rotation.x = 1.3;

    const spot = new THREE.SpotLight('#fff0c8', 60, 15, 0.46, 0.55, 1.1);
    spot.castShadow = shadows;
    spot.shadow.mapSize.set(shadowSize, shadowSize);
    spot.shadow.camera.near = 0.3;
    spot.shadow.camera.far = 15;
    spot.shadow.bias = -0.0006;
    spot.shadow.normalBias = 0.03;
    scene.add(spot);
    scene.add(spot.target);
    this.spot = spot;

    // soft glow around Nate so nearby furniture is always visible
    this.aura = new THREE.PointLight('#c8b8ff', 7, 7, 1.4);
    scene.add(this.aura);

    // fake volumetric beam cone
    const len = BEAM_RANGE;
    const geo = new THREE.ConeGeometry(Math.tan(0.4) * len, len, 28, 1, true);
    geo.translate(0, -len / 2, 0);
    geo.rotateX(-Math.PI / 2);
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ffe9b0') }, uPower: { value: 1 }, uTime: { value: 0 }, uSuck: { value: 0 } },
      vertexShader: /* glsl */ `
        varying float vAlong; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){
          vAlong = clamp(position.z / ${len.toFixed(1)}, 0.0, 1.0);
          vP = position;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uPower; uniform float uTime; uniform float uSuck;
        varying float vAlong; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){
          float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
          float fall = pow(1.0 - vAlong, 1.6) * smoothstep(0.0, 0.06, vAlong);
          float swirl = 1.0 + uSuck * 0.8 * sin(vAlong * 30.0 + uTime * 25.0 + atan(vP.y, vP.x) * 3.0);
          float a = edge * fall * 0.3 * uPower * swirl;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(geo, this.beamMat);
    this.beam.position.set(0.29, 0.98, 0.5);
    this.beam.rotation.x = 0.12;
    this.beam.renderOrder = 6;
    this.model.root.add(this.beam);
  }

  reset(x: number, z: number) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.facing = Math.PI;
    this.stunT = 0;
  }

  update(dt: number, t: number, input: Input | null, grid: Grid, aimAssist: THREE.Vector3 | null) {
    let mx = 0,
      mz = 0;
    if (input && this.stunT <= 0) {
      mx = input.moveX;
      mz = input.moveZ;
    }
    this.stunT = Math.max(0, this.stunT - dt);
    const mag = Math.min(1, Math.hypot(mx, mz));
    const speed = this.moveSpeed * (this.vacuuming ? 0.62 : 1);
    const accel = mag > 0.05 ? 22 : 30;
    this.vel.x += (mx * speed - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (mz * speed - this.vel.z) * Math.min(1, dt * accel);
    grid.move(this.pos, this.vel.x * dt, this.vel.z * dt, 0.3);

    // facing: follow stick, nudged by aim assist
    let want = this.facing;
    if (mag > 0.1) want = Math.atan2(mx, mz);
    if (aimAssist) {
      const a = Math.atan2(aimAssist.x - this.pos.x, aimAssist.z - this.pos.z);
      let d = a - want;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      want += d * (this.vacuuming ? 0.85 : 0.5);
    }
    let diff = want - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const turn = (this.stunT > 0 ? 0 : 16) * dt;
    this.facing += Math.max(-turn, Math.min(turn, diff));
    if (this.stunT > 0) this.facing += dt * 14; // dizzy spin after a prank
    this.dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));

    // animation
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.phase += sp * dt * 2.3;
    this.stepAcc += sp * dt;
    if (this.stepAcc > 0.85) {
      this.stepAcc = 0;
      this.onStep?.();
    }
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.facing;
    animateHumanoid(m, this.phase, sp / this.moveSpeed, t, 1);
    m.armR.rotation.x = -1.3 + Math.sin(this.phase * 2) * 0.04 + (this.vacuuming ? Math.sin(t * 40) * 0.02 : 0);
    m.armR.rotation.z = 0.25;
    m.wand.rotation.z = -0.25;

    // flashlight
    m.root.updateMatrixWorld(true);
    m.nozzle.getWorldPosition(this.nozzleWorld);
    this.spot.position.copy(this.nozzleWorld);
    this.beam.position.copy(m.root.worldToLocal(this.nozzleWorld.clone()));
    this.spot.target.position.set(this.pos.x + this.dir.x * 5, 0, this.pos.z + this.dir.z * 5);
    this.spot.target.updateMatrixWorld();
    this.aura.position.set(this.pos.x, 2.6, this.pos.z);
    this.aura.intensity = 7 * (0.3 + 0.7 * this.flashlightPower);
    const flick = this.flashlightPower;
    this.spot.intensity = 60 * flick;
    this.beamMat.uniforms.uPower.value = flick * (this.vacuuming ? 1.5 : 1);
    this.beamMat.uniforms.uTime.value = t;
    this.beamMat.uniforms.uSuck.value = this.vacuuming ? 1 : 0;
    (this.beamMat.uniforms.uColor.value as THREE.Color).set(this.vacuuming ? '#9ff8ff' : '#ffe9b0');
    this.spot.color.set(this.vacuuming ? '#d8fff8' : '#fff0c8');
    m.lensMat.color.set(this.vacuuming ? '#b0ffff' : '#fff4c0');
  }

  /** Is world point (x,z) inside the flashlight cone? */
  inCone(x: number, z: number, range = BEAM_RANGE, half = BEAM_HALF_ANGLE) {
    const dx = x - this.pos.x,
      dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d < 0.9) return true; // right on top of you counts
    const dot = (dx * this.dir.x + dz * this.dir.z) / d;
    return dot > Math.cos(half);
  }
}
