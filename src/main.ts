import * as THREE from 'three';
import { Game, type Quality } from './game';
import { setMaxAnisotropy } from './world/textures';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const debug = new URLSearchParams(location.search).has('debug');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

const quality: Quality = mobile ? { shadows: true, shadowSize: 512, lights: 3 } : { shadows: true, shadowSize: 1024, lights: 4 };

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0714');
scene.fog = new THREE.Fog('#0b0714', 22, 48);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 120);

// Adaptive resolution: start at up to 2x, step down if frames get slow.
const maxRatio = Math.min(devicePixelRatio, 2);
let ratio = maxRatio;
let viewportH = innerHeight * ratio;
function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  viewportH = h * ratio;
}
addEventListener('resize', resize);
resize();

const game = new Game(scene, camera, quality);
renderer.compile(scene, camera);
document.getElementById('loading')!.classList.add('hidden');
game.hud.show('title');

const fpsEl = document.getElementById('fps')!;
if (debug) {
  fpsEl.classList.remove('hidden');
  (window as unknown as { game: Game }).game = game;
}

let last = performance.now();
let frames = 0;
let acc = 0;
let slowSecs = 0;
let fastSecs = 0;
function loop(now: number) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(raw, 1 / 20);
  game.update(dt, now / 1000, viewportH);
  renderer.render(scene, camera);

  frames++;
  acc += raw;
  if (acc >= 1) {
    const fps = frames / acc;
    if (fps < 48) {
      slowSecs++;
      fastSecs = 0;
    } else if (fps > 58) {
      fastSecs++;
      slowSecs = 0;
    }
    if (slowSecs >= 2 && ratio > 0.75) {
      ratio = Math.max(0.75, ratio - 0.25);
      slowSecs = 0;
      resize();
    } else if (fastSecs >= 8 && ratio < maxRatio) {
      ratio = Math.min(maxRatio, ratio + 0.25);
      fastSecs = 0;
      resize();
    }
    if (debug) fpsEl.textContent = `${fps.toFixed(0)} fps · ${ratio.toFixed(2)}x · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`;
    frames = 0;
    acc = 0;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
