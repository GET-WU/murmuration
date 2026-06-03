import { Boid, computeFlockingForces, computeMouseForce, computeEdgeForce, computeGlobalCohesion } from './boids.js';
import { SpatialGrid } from './spatial-grid.js';
import { MouseState } from './mouse.js';
import { Renderer } from './renderer.js';
import { createControls } from './controls.js';
import { AudioManager } from './audio.js';

const PARAMS = {
  count: 1500,
  maxSpeed: 9.0,
  minSpeed: 1.5,
  maxForce: 0.5,

  perceptionRadius: 200,
  separationRadius: 26,

  separationWeight: 5.0,
  alignmentWeight: 2.6,
  cohesionWeight: 1.8,
  globalCohesionWeight: 0.15,
  topologyK: 10,
  mouseDirectRatio: 0.7,

  mouseAttractionRadius: 800,
  mouseAttractionWeight: 2.0,
  scatterRadius: 150,
  scatterStrength: 2.0,
  scatterDuration: 1000,
  idleTimeout: 200,

  edgeMargin: 100,
  edgeTurnFactor: 0.5,

  depthRange: 200,
  zEdgeFactor: 0.8,

  boidSize: 3,
  boidWidth: 1.5,
  shadowBlur: 3,

  trailColor: '#b4d56c',

  rippleColor: '#e6eab3',
  rippleAlpha: 0.3,
  rippleWidth1: 15.0,
  rippleWidth2: 5.0,
  rippleSize: 80,
  rippleSpeed: 1.6,
  rippleDuration: 2.5,
  boidColor: 'rgba(20, 10, 30, 0.85)',
};

const REF_WIDTH = 800;
const SPATIAL_KEYS = [
  'maxSpeed', 'minSpeed', 'perceptionRadius', 'separationRadius',
  'mouseAttractionRadius', 'scatterRadius', 'edgeMargin', 'depthRange',
  'boidSize', 'boidWidth', 'shadowBlur', 'rippleWidth1', 'rippleWidth2', 'rippleSize',
];

function getScaledParams(width) {
  const s = width / REF_WIDTH;
  const sp = {};
  for (const key in PARAMS) {
    sp[key] = PARAMS[key];
  }
  for (const key of SPATIAL_KEYS) {
    if (sp[key] !== undefined) sp[key] = PARAMS[key] * s;
  }
  sp._scale = s;
  return sp;
}

const canvas = document.getElementById('canvas');
const renderer = new Renderer(canvas);
const mouse = new MouseState(canvas, PARAMS);
const audio = new AudioManager();
mouse.onActivate = (idleDuration) => { if (!perched && idleDuration > 1000) audio.onFollow(); };
mouse.onMove = (x, y) => { if (!perched) renderer.updateTrail(x, y); };

mouse.onTap = (x, y) => {
  renderer.addRipple(x, y);
  audio.onClick();
  if (!perched) return;
  canvas.style.cursor = 'none';
  renderer.resetTrail(x, y);
  launchFromTree();
};

mouse.onDoubleTwoFingerTap = () => {
  if (returning) return;
  if (perched) { init(); return; }
  audio.fadeOut(3000);
  returnToTree();
};

let boids = [];
let scaledParams = getScaledParams(renderer.width);
let grid = new SpatialGrid(renderer.width, renderer.height, scaledParams.perceptionRadius / 2, 2);
let flockCenterX = 0;
let flockCenterY = 0;
let flockCenterZ = 0;
let perched = true;
let returning = false;
let returnTimer = 0;
let maskPositions = [];
let maskCenter = { x: 0, y: 0 };
let homePositions = [];
const _mouseIdx = new Int32Array(2100);
const _mouseDst = new Float64Array(2100);

function loadMask() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const positions = [];
      const yLimit = Math.floor(c.height * 0.88);
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const px = (i / 4) % c.width;
        const py = Math.floor((i / 4) / c.width);
        if (py > yLimit) continue;
        const diff = r - Math.min(g, b);
        if (diff > 15) {
          positions.push([px / img.width, py / img.height, diff]);
        }
      }
      resolve(positions);
    };
    img.onerror = () => resolve([]);
    img.src = '素材/mask.png';
  });
}

function init() {
  boids = [];
  perched = true;
  const w = renderer.width;
  const h = renderer.height;

  if (maskPositions.length > 0) {
    let sumX = 0, sumY = 0;
    let placed = 0;
    while (placed < PARAMS.count) {
      const entry = maskPositions[Math.floor(Math.random() * maskPositions.length)];
      if (Math.random() * 130 < entry[2]) {
        const px = entry[0] * w + (Math.random() - 0.5) * 3;
        const py = entry[1] * h + (Math.random() - 0.5) * 3;
        sumX += px; sumY += py;
        const b = new Boid(px, py, (Math.random() - 0.5) * 120);
        b.vx = 0; b.vy = 0; b.vz = 0;
        boids.push(b);
        placed++;
      }
    }
    maskCenter.x = sumX / PARAMS.count;
    maskCenter.y = sumY / PARAMS.count;
  } else {
    const cx = w / 2;
    const cy = h * 0.6;
    maskCenter.x = cx;
    maskCenter.y = cy;
    for (let i = 0; i < PARAMS.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.5) * 60;
      const b = new Boid(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, (Math.random() - 0.5) * 20);
      b.vx = 0; b.vy = 0; b.vz = 0;
      boids.push(b);
    }
  }
}

function generateHomePositions(count) {
  const w = renderer.width;
  const h = renderer.height;
  homePositions = [];
  if (maskPositions.length > 0) {
    let placed = 0;
    while (placed < count) {
      const entry = maskPositions[Math.floor(Math.random() * maskPositions.length)];
      if (Math.random() * 130 < entry[2]) {
        homePositions.push({
          x: entry[0] * w + (Math.random() - 0.5) * 3,
          y: entry[1] * h + (Math.random() - 0.5) * 3,
          z: (Math.random() - 0.5) * 120,
        });
        placed++;
      }
    }
  } else {
    const cx = w / 2, cy = h * 0.6;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.5) * 60;
      homePositions.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        z: (Math.random() - 0.5) * 20,
      });
    }
  }
}

function returnToTree() {
  if (perched) return;
  returning = true;
  returnTimer = 0;
  generateHomePositions(boids.length);
}

function launchFromTree() {
  if (!perched) return;
  perched = false;
  const cx = maskCenter.x;
  const cy = maskCenter.y;
  for (let i = 0; i < boids.length; i++) {
    const b = boids[i];
    const dx = b.x - cx;
    const dy = b.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const strength = 8 + Math.random() * 4;
    b.vx = (dx / dist) * strength + (Math.random() - 0.5) * 3;
    b.vy = (dy / dist) * strength - Math.random() * 5;
    b.vz = (Math.random() - 0.5) * 4;
  }
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  renderer.addRipple(e.clientX - rect.left, e.clientY - rect.top);
  audio.onClick();
  if (!perched) return;
  canvas.style.cursor = 'none';
  renderer.resetTrail(e.clientX - rect.left, e.clientY - rect.top);
  launchFromTree();
});

function updateFlock(dt) {
  if (perched) return;

  if (returning) {
    returnTimer += dt;
    let settled = 0;
    const settlePhase = Math.min(1, returnTimer / 120);

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      const hp = homePositions[i];
      if (!hp) continue;
      const dx = hp.x - b.x, dy = hp.y - b.y, dz = hp.z - b.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 5) {
        b.x += dx * 0.08;
        b.y += dy * 0.08;
        b.z += dz * 0.08;
        b.vx *= 0.7; b.vy *= 0.7; b.vz *= 0.7;
        const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
        if (spd < 0.3 && dist < 1) settled++;
      } else {
        const cx = maskCenter.x, cy = maskCenter.y;
        const toCenterX = cx - b.x, toCenterY = cy - b.y;
        const toCenterDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY) || 1;

        const targetX = toCenterX / toCenterDist * (1 - settlePhase) + (dx / dist) * settlePhase;
        const targetY = toCenterY / toCenterDist * (1 - settlePhase) + (dy / dist) * settlePhase;
        const targetZ = (dz / dist) * settlePhase;

        const strength = 0.5;
        const damping = 0.95 - settlePhase * 0.07;
        const noise = (1 - settlePhase) * 0.4;
        b.vx = b.vx * damping + targetX * strength + (Math.random() - 0.5) * noise;
        b.vy = b.vy * damping + targetY * strength + (Math.random() - 0.5) * noise;
        b.vz = b.vz * damping + targetZ * strength * 0.5 + (Math.random() - 0.5) * noise * 0.3;

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
      }

      const spd2d = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (spd2d > 0.3) {
        const target = Math.atan2(b.vy, b.vx);
        let diff = target - b.heading;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        b.heading += diff * 0.15;
      }
    }

    if (settled > boids.length * 0.85) {
      returning = false;
      perched = true;
      for (let i = 0; i < boids.length; i++) {
        const hp = homePositions[i];
        if (hp) { boids[i].x = hp.x; boids[i].y = hp.y; boids[i].z = hp.z; }
        boids[i].vx = 0; boids[i].vy = 0; boids[i].vz = 0;
      }
      const waitForFade = () => {
        if (audio.fadeComplete) {
          audio.reset();
          canvas.style.cursor = 'pointer';
          renderer.resetTrail(-100, -100);
        } else {
          requestAnimationFrame(waitForFade);
        }
      };
      waitForFade();
    }
    return;
  }

  const w = renderer.width;
  const h = renderer.height;
  const n = boids.length;

  let sumX = 0, sumY = 0, sumZ = 0;
  for (let i = 0; i < n; i++) {
    sumX += boids[i].x;
    sumY += boids[i].y;
    sumZ += boids[i].z;
  }
  flockCenterX = sumX / n;
  flockCenterY = sumY / n;
  flockCenterZ = sumZ / n;

  for (let i = 0; i < n; i++) boids[i].mouseInfluence = 0;
  if (!mouse.isIdle() && !mouse.isScattering()) {
    const N = Math.min(Math.floor(n * scaledParams.mouseDirectRatio), n);
    if (N > 0) {
      const nearIdx = _mouseIdx;
      const nearDst = _mouseDst;
      let nearCount = 0;
      let nearMaxPos = 0;

      for (let i = 0; i < N; i++) { nearIdx[i] = -1; nearDst[i] = Infinity; }

      for (let i = 0; i < n; i++) {
        const dx = boids[i].x - mouse.x;
        const dy = boids[i].y - mouse.y;
        const d = dx * dx + dy * dy;

        if (nearCount < N) {
          nearIdx[nearCount] = i;
          nearDst[nearCount] = d;
          nearCount++;
          if (nearCount === N) {
            nearMaxPos = 0;
            for (let m = 1; m < N; m++) if (nearDst[m] > nearDst[nearMaxPos]) nearMaxPos = m;
          }
        } else if (d < nearDst[nearMaxPos]) {
          nearIdx[nearMaxPos] = i;
          nearDst[nearMaxPos] = d;
          nearMaxPos = 0;
          for (let m = 1; m < N; m++) if (nearDst[m] > nearDst[nearMaxPos]) nearMaxPos = m;
        }
      }

      let maxDst = 0;
      for (let i = 0; i < nearCount; i++) {
        if (nearDst[i] > maxDst && nearDst[i] < Infinity) maxDst = nearDst[i];
      }
      const maxD = Math.sqrt(maxDst) || 1;

      for (let i = 0; i < nearCount; i++) {
        if (nearIdx[i] >= 0) {
          const t = Math.sqrt(nearDst[i]) / maxD;
          boids[nearIdx[i]].mouseInfluence = (1 - t) * (1 - t);
        }
      }
    }
  }

  grid.clear();
  for (let i = 0; i < n; i++) {
    grid.insert(boids[i], i);
  }

  const isScattering = mouse.isScattering();
  for (let i = 0; i < n; i++) {
    const boid = boids[i];
    const nCount = grid.getNeighborCount(boid.x, boid.y);

    computeFlockingForces(boids, i, nCount, scaledParams);
    computeGlobalCohesion(boid, flockCenterX, flockCenterY, flockCenterZ, scaledParams.globalCohesionWeight);
    computeMouseForce(boid, mouse, scaledParams);
    const axBefore = boid.ax, ayBefore = boid.ay, azBefore = boid.az;
    computeEdgeForce(boid, w, h, scaledParams, renderer.shadowGroundY);
    if (isScattering) {
      boid.ax += (boid.ax - axBefore) * 2;
      boid.ay += (boid.ay - ayBefore) * 2;
      boid.az += (boid.az - azBefore) * 2;
    }

    boid.ax += (Math.random() - 0.5) * 0.06;
    boid.ay += (Math.random() - 0.5) * 0.06;
    boid.az += (Math.random() - 0.5) * 0.04;
  }

  const floorY = renderer.shadowGroundY;
  for (let i = 0; i < n; i++) {
    boids[i].update(dt, scaledParams);
    if (boids[i].y > floorY) {
      boids[i].y = floorY;
      boids[i].vy = -Math.abs(boids[i].vy);
    }
  }

  audio.updateVolume(flockCenterZ, scaledParams.depthRange);
}

const FIXED_DT = 16.67;
let lastTime = 0;
let accumulator = 0;
let frameCount = 0;
let fpsAccum = 0;

function loop(timestamp) {
  if (lastTime === 0) { lastTime = timestamp; }
  const frameDt = timestamp - lastTime;
  lastTime = timestamp;

  accumulator += Math.min(frameDt, 100);
  mouse.update(frameDt);

  scaledParams = getScaledParams(renderer.width);

  while (accumulator >= FIXED_DT) {
    updateFlock(1.0);
    accumulator -= FIXED_DT;
  }

  renderer.draw(boids, scaledParams, timestamp, mouse);

  frameCount++;
  fpsAccum += frameDt;
  if (frameCount === 60 && fpsAccum / 60 > 22) {
    const newCount = Math.max(800, Math.floor(PARAMS.count * 0.6));
    if (newCount < boids.length) {
      boids.length = newCount;
      PARAMS.count = newCount;
    }
  }

  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  renderer.resize();
  scaledParams = getScaledParams(renderer.width);
  grid = new SpatialGrid(renderer.width, renderer.height, scaledParams.perceptionRadius / 2, 2);
});

createControls(PARAMS, {
  onCountChange(newCount) {
    const diff = newCount - boids.length;
    if (diff > 0) {
      for (let i = 0; i < diff; i++) {
        boids.push(new Boid(
          flockCenterX + (Math.random() - 0.5) * 100,
          flockCenterY + (Math.random() - 0.5) * 100,
          flockCenterZ + (Math.random() - 0.5) * 100
        ));
      }
    } else if (diff < 0) {
      boids.length = newCount;
    }
  },
  onPerceptionChange() {
    scaledParams = getScaledParams(renderer.width);
    grid = new SpatialGrid(renderer.width, renderer.height, scaledParams.perceptionRadius / 2, 2);
  },
  onRespawn() {
    if (returning) return;
    if (perched) { init(); return; }
    audio.fadeOut(3000);
    returnToTree();
  },
});

loadMask().then((positions) => {
  maskPositions = positions;
  console.log(`Mask loaded: ${positions.length} red pixels found`);
  init();
  requestAnimationFrame(loop);
});
