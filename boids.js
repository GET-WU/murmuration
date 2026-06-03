import { _neighbors } from './spatial-grid.js';

export class Boid {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z || 0;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI * 0.5;
    const speed = 2 + Math.random() * 2;
    this.vx = Math.cos(theta) * Math.cos(phi) * speed;
    this.vy = Math.sin(theta) * Math.cos(phi) * speed;
    this.vz = Math.sin(phi) * speed;
    this.ax = 0;
    this.ay = 0;
    this.az = 0;
    this.mouseInfluence = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.heading = Math.random() * Math.PI * 2 - Math.PI;
  }

  applyForce(fx, fy, fz) {
    this.ax += fx;
    this.ay += fy;
    this.az += (fz || 0);
  }

  update(dt, params) {
    this.vx += this.ax * dt;
    this.vy += this.ay * dt;
    this.vz += this.az * dt;

    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
    if (speed > params.maxSpeed) {
      const s = params.maxSpeed / speed;
      this.vx *= s; this.vy *= s; this.vz *= s;
    } else if (speed < params.minSpeed && speed > 0.001) {
      const s = params.minSpeed / speed;
      this.vx *= s; this.vy *= s; this.vz *= s;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    const speed2d = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed2d > 0.5) {
      const target = Math.atan2(this.vy, this.vx);
      let diff = target - this.heading;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * 0.15;
    }

    this.ax = 0;
    this.ay = 0;
    this.az = 0;
  }
}

const _sv = { x: 0, y: 0, z: 0 };

function steer3d(dx, dy, dz, vx, vy, vz, maxSpeed, maxForce) {
  const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (mag < 0.001) { _sv.x = 0; _sv.y = 0; _sv.z = 0; return; }
  let sx = dx / mag * maxSpeed - vx;
  let sy = dy / mag * maxSpeed - vy;
  let sz = dz / mag * maxSpeed - vz;
  const fMag = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (fMag > maxForce) {
    const s = maxForce / fMag;
    sx *= s; sy *= s; sz *= s;
  }
  _sv.x = sx; _sv.y = sy; _sv.z = sz;
}

const _tkIdx = new Int32Array(32);
const _tkDst = new Float64Array(32);

export function computeFlockingForces(boids, i, nCount, params) {
  const boid = boids[i];
  const K = params.topologyK || 7;

  const speed = Math.sqrt(boid.vx * boid.vx + boid.vy * boid.vy + boid.vz * boid.vz);
  const dirX = speed > 0.001 ? boid.vx / speed : 0;
  const dirY = speed > 0.001 ? boid.vy / speed : 0;
  const dirZ = speed > 0.001 ? boid.vz / speed : 0;

  let tkCount = 0;
  let tkMaxPos = 0;

  for (let k = 0; k < nCount; k++) {
    const j = _neighbors[k];
    if (j === i) continue;
    const other = boids[j];
    const dx = other.x - boid.x;
    const dy = other.y - boid.y;
    const dz = other.z - boid.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < 0.001) continue;

    if (tkCount < K) {
      _tkIdx[tkCount] = j;
      _tkDst[tkCount] = distSq;
      tkCount++;
      if (tkCount === K) {
        tkMaxPos = 0;
        for (let m = 1; m < K; m++) if (_tkDst[m] > _tkDst[tkMaxPos]) tkMaxPos = m;
      }
    } else if (distSq < _tkDst[tkMaxPos]) {
      _tkIdx[tkMaxPos] = j;
      _tkDst[tkMaxPos] = distSq;
      tkMaxPos = 0;
      for (let m = 1; m < K; m++) if (_tkDst[m] > _tkDst[tkMaxPos]) tkMaxPos = m;
    }
  }

  let sepX = 0, sepY = 0, sepZ = 0, sepCount = 0;
  let aliX = 0, aliY = 0, aliZ = 0, aliW = 0;
  let cohX = 0, cohY = 0, cohZ = 0, cohCount = 0;

  const srSq = params.separationRadius * params.separationRadius;

  for (let k = 0; k < tkCount; k++) {
    const j = _tkIdx[k];
    const distSq = _tkDst[k];
    const other = boids[j];
    const dx = boid.x - other.x;
    const dy = boid.y - other.y;
    const dz = boid.z - other.z;
    const dist = Math.sqrt(distSq);

    if (distSq < srSq) {
      sepX += dx / dist;
      sepY += dy / dist;
      sepZ += dz / dist;
      sepCount++;
    }

    const toNeighX = -dx / dist;
    const toNeighY = -dy / dist;
    const toNeighZ = -dz / dist;
    const dot = dirX * toNeighX + dirY * toNeighY + dirZ * toNeighZ;
    const w = 0.3 + 0.7 * Math.max(0, dot);

    aliX += other.vx * w;
    aliY += other.vy * w;
    aliZ += other.vz * w;
    aliW += w;

    cohX += other.x;
    cohY += other.y;
    cohZ += other.z;
    cohCount++;
  }

  if (sepCount > 0) {
    sepX /= sepCount; sepY /= sepCount; sepZ /= sepCount;
    steer3d(sepX, sepY, sepZ, boid.vx, boid.vy, boid.vz, params.maxSpeed, params.maxForce);
    boid.ax += _sv.x * params.separationWeight;
    boid.ay += _sv.y * params.separationWeight;
    boid.az += _sv.z * params.separationWeight;
  }

  if (aliW > 0.001) {
    aliX /= aliW; aliY /= aliW; aliZ /= aliW;
    steer3d(aliX, aliY, aliZ, boid.vx, boid.vy, boid.vz, params.maxSpeed, params.maxForce);
    boid.ax += _sv.x * params.alignmentWeight;
    boid.ay += _sv.y * params.alignmentWeight;
    boid.az += _sv.z * params.alignmentWeight;
  }

  if (cohCount > 0) {
    cohX /= cohCount; cohY /= cohCount; cohZ /= cohCount;
    steer3d(cohX - boid.x, cohY - boid.y, cohZ - boid.z,
      boid.vx, boid.vy, boid.vz, params.maxSpeed, params.maxForce);
    boid.ax += _sv.x * params.cohesionWeight;
    boid.ay += _sv.y * params.cohesionWeight;
    boid.az += _sv.z * params.cohesionWeight;
  }
}

export function computeMouseForce(boid, mouse, params) {
  if (mouse.isIdle()) return;

  const dx = mouse.x - boid.x;
  const dy = mouse.y - boid.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (mouse.isScattering()) {
    if (dist < params.scatterRadius && dist > 0.001) {
      const strength = params.scatterStrength * mouse.scatterDecay * (1 - dist / params.scatterRadius);
      boid.ax += -dx / dist * strength;
      boid.ay += -dy / dist * strength;
      boid.az += (Math.random() - 0.5) * strength * 0.5;
    }
    return;
  }

  if (boid.mouseInfluence < 0.001 || dist < 1) return;

  const t = Math.min(dist / params.mouseAttractionRadius, 1);
  const strength = params.mouseAttractionWeight * (1 - t * t) * boid.mouseInfluence;
  boid.ax += dx / dist * strength;
  boid.ay += dy / dist * strength;
  boid.az += -boid.z * 0.02 * boid.mouseInfluence;
}

export function computeGlobalCohesion(boid, centerX, centerY, centerZ, weight) {
  const dx = centerX - boid.x;
  const dy = centerY - boid.y;
  const dz = centerZ - boid.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1) return;
  const strength = weight * Math.min(dist / 300, 1.0);
  boid.ax += dx / dist * strength;
  boid.ay += dy / dist * strength;
  boid.az += dz / dist * strength;
}

export function computeEdgeForce(boid, width, height, params, floorY) {
  const m = params.edgeMargin;
  const f = params.edgeTurnFactor;
  const bottom = floorY || height;

  if (boid.x < m) boid.ax += f * (1 - boid.x / m);
  else if (boid.x > width - m) boid.ax -= f * (1 - (width - boid.x) / m);

  if (boid.y < m) boid.ay += f * (1 - boid.y / m);
  else if (boid.y > bottom - m) boid.ay -= f * (1 - (bottom - boid.y) / m);

  const zMax = params.depthRange || 200;
  const zMargin = zMax * 0.7;
  const zf = params.zEdgeFactor || 0.8;
  if (boid.z > zMargin) boid.az -= zf * ((boid.z - zMargin) / (zMax - zMargin));
  else if (boid.z < -zMargin) boid.az += zf * ((-boid.z - zMargin) / (zMax - zMargin));
}
