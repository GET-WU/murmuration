const IMG_W = 1080;
const IMG_H = 1350;
const HORIZON_Y = 1212 / IMG_H;
const SHADOW_GROUND_Y = 1254 / IMG_H;

function drawBird(ctx, x, y, size, halfWidth, angle, flattenY) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const sy = flattenY || 1;
  const notch = size * 0.5;

  const tipX = x + size * cos;
  const tipY = y + size * sin * sy;
  const leftX = x - size * cos + halfWidth * sin;
  const leftY = (y - size * sin - halfWidth * cos) * sy + y * (1 - sy);
  const notchX = x - notch * cos;
  const notchY = y - notch * sin * sy;
  const rightX = x - size * cos - halfWidth * sin;
  const rightY = (y - size * sin + halfWidth * cos) * sy + y * (1 - sy);

  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(notchX, notchY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this._sortedIndices = [];
    this.ripples = [];
    this._trailNodes = [];
    for (let i = 0; i < 20; i++) this._trailNodes.push({ x: -100, y: -100 });
    this._trailLastMove = 0;
    this.bgReady = false;
    this.bg = new Image();
    this.bg.onload = () => { this.bgReady = true; };
    this.bg.src = '素材/087dde6f4a36d229db50995b8f37c335.jpg';
    this.resize();
  }

  resetTrail(mx, my) {
    for (const n of this._trailNodes) { n.x = mx; n.y = my; }
    this._trailLastMove = 0;
  }

  updateTrail(mx, my) {
    this._trailLastMove = performance.now();
    this._trailNodes[0].x = mx;
    this._trailNodes[0].y = my;
  }

  addRipple(x, y) {
    this.ripples.push({ x, y, radius: 0, alpha: 0.4, born: performance.now() });
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vh / vw > IMG_H / IMG_W) {
      this.width = vw;
      this.height = Math.round(vw * (IMG_H / IMG_W));
    } else {
      this.height = vh;
      this.width = Math.round(vh * (IMG_W / IMG_H));
    }
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.horizonY = this.height * HORIZON_Y;
    this.shadowGroundY = this.height * SHADOW_GROUND_Y;
    this.scale = this.height / IMG_H;
  }

  draw(boids, params, timestamp) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const depthRange = params.depthRange || 200;

    if (this.bgReady) {
      ctx.drawImage(this.bg, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, w, h);
    }

    const n = boids.length;
    if (this._sortedIndices.length !== n) {
      this._sortedIndices = new Array(n);
      for (let i = 0; i < n; i++) this._sortedIndices[i] = i;
      this._sortedFrame = 0;
    }
    if (this._sortedFrame === undefined || ++this._sortedFrame >= 3) {
      this._sortedFrame = 0;
      this._sortedIndices.sort((a, b) => boids[a].z - boids[b].z);
    }

    const shadowGroundY = this.shadowGroundY;
    const maxHeight = shadowGroundY;
    const baseBlur = params.shadowBlur || 3;

    const shadowLayers = baseBlur > 0.1
      ? [
          { minH: 0,    maxH: 0.25, alpha: 0.30, blurMul: 0.2 },
          { minH: 0.25, maxH: 0.50, alpha: 0.23, blurMul: 0.5 },
          { minH: 0.50, maxH: 0.75, alpha: 0.16, blurMul: 0.8 },
          { minH: 0.75, maxH: 1.01, alpha: 0.10, blurMul: 1.0 },
        ]
      : [
          { minH: 0, maxH: 1.01, alpha: 0.18, blurMul: 0 },
        ];

    for (const sl of shadowLayers) {
      const blur = baseBlur * sl.blurMul;
      ctx.filter = blur > 0.1 ? `blur(${blur}px)` : 'none';
      ctx.fillStyle = `rgba(0, 0, 0, ${sl.alpha})`;
      ctx.beginPath();

      for (let i = 0; i < n; i++) {
        const b = boids[this._sortedIndices[i]];
        const heightAbove = Math.max(0, shadowGroundY - b.y);
        const hRatio = Math.min(heightAbove / maxHeight, 1);
        if (hRatio < sl.minH || hRatio >= sl.maxH) continue;

        const depthT = (b.z + depthRange) / (2 * depthRange);
        const perspScale = 0.3 + depthT * 1.2;
        const size = params.boidSize * (0.3 + depthT * 0.4);

        const sx = b.x + heightAbove * 0.05 * perspScale;
        const sy = shadowGroundY - 5 + heightAbove * 0.04 * perspScale;

        const angle = b.heading;
        drawBird(ctx, sx, sy, size, size * 0.4, angle, 0.4 * perspScale);
      }

      ctx.fill();
    }
    ctx.filter = 'none';

    const layers = [
      { maxZ: -depthRange * 0.33, alpha: 0.4 },
      { maxZ: depthRange * 0.33,  alpha: 0.65 },
      { maxZ: depthRange + 1,     alpha: 0.9 },
    ];

    const baseSize = params.boidSize;
    const baseWidth = params.boidWidth;
    let idx = 0;

    for (const layer of layers) {
      ctx.fillStyle = `rgba(20, 10, 30, ${layer.alpha})`;
      ctx.beginPath();

      while (idx < n && boids[this._sortedIndices[idx]].z < layer.maxZ) {
        const b = boids[this._sortedIndices[idx]];
        const zNorm = b.z / depthRange;
        const scale = 1 + zNorm * 0.5;
        const size = baseSize * scale;

        const halfWidth = baseWidth * scale;
        const angle = b.heading;
        drawBird(ctx, b.x, b.y, size, halfWidth, angle);

        idx++;
      }

      ctx.fill();
    }

    const now = performance.now();
    const hex = params.rippleColor || '#322823';
    const rr = parseInt(hex.slice(1, 3), 16);
    const rg = parseInt(hex.slice(3, 5), 16);
    const rb = parseInt(hex.slice(5, 7), 16);
    const rAlpha = params.rippleAlpha || 0.35;
    const rSize = params.rippleSize || 120;
    const rSpeed = params.rippleSpeed || 1.0;
    const rDur = (params.rippleDuration || 1.8) / rSpeed;

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      const age = (now - rp.born) * 0.001;
      if (age > rDur) { this.ripples.splice(i, 1); continue; }

      const t = age / rDur;
      const ease = 1 - Math.pow(1 - t, 4);

      const r1 = 5 + ease * rSize;
      const a1 = rAlpha * (1 - t);
      ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${a1})`;
      ctx.lineWidth = (params.rippleWidth1 || 1.5) * (1 - t * 0.4);
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, r1, 0, Math.PI * 2);
      ctx.stroke();

      const t2 = Math.max(0, t - 0.15) / 0.85;
      if (t2 > 0 && t2 < 1) {
        const ease2 = 1 - Math.pow(1 - t2, 4);
        const r2 = 5 + ease2 * rSize * 1.5;
        const a2 = rAlpha * 0.6 * (1 - t2) * (1 - t2);
        ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${a2})`;
        ctx.lineWidth = (params.rippleWidth2 || 1.0) * (1 - t2 * 0.4);
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, r2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // mouse trail
    const nodes = this._trailNodes;
    for (let i = 1; i < nodes.length; i++) {
      nodes[i].x += (nodes[i - 1].x - nodes[i].x) * 0.35;
      nodes[i].y += (nodes[i - 1].y - nodes[i].y) * 0.35;
    }
    const trailIdle = now - this._trailLastMove;
    const trailFade = trailIdle < 100 ? 1 : Math.max(0, 1 - (trailIdle - 100) / 500);
    if (trailFade > 0.01 && nodes[0].x > 0) {
      const thex = params.trailColor || '#3c3228';
      const tr = parseInt(thex.slice(1, 3), 16);
      const tg = parseInt(thex.slice(3, 5), 16);
      const tb = parseInt(thex.slice(5, 7), 16);
      for (let i = 1; i < nodes.length; i++) {
        const t = 1 - i / nodes.length;
        ctx.strokeStyle = `rgba(${tr}, ${tg}, ${tb}, ${t * 0.4 * trailFade})`;
        ctx.lineWidth = t * 4 * trailFade;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(nodes[i - 1].x, nodes[i - 1].y);
        ctx.lineTo(nodes[i].x, nodes[i].y);
        ctx.stroke();
      }
    }
  }
}
