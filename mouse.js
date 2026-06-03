const STATE = { IDLE: 'idle', ACTIVE: 'active', SCATTER: 'scatter' };

export class MouseState {
  constructor(canvas, params) {
    this.state = STATE.IDLE;
    this.x = 0;
    this.y = 0;
    this.canvas = canvas;
    this.params = params;
    this.idleTimer = 0;
    this.scatterTimer = 0;
    this.scatterDecay = 0;
    this.lastMoveTime = 0;
    this.inCanvas = false;
    this.onActivate = null;
    this.onMove = null;
    this.onTap = null;
    this.onDoubleTwoFingerTap = null;
    this._idleSince = 0;

    // touch state
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._touchStartTime = 0;
    this._touchMoved = false;
    this._touchFingers = 0;
    this._lastTwoFingerTapTime = 0;

    // desktop events
    canvas.addEventListener('mousemove', (e) => this._onMove(e));
    canvas.addEventListener('mousedown', (e) => this._onClick(e));
    canvas.addEventListener('mouseleave', () => this._onLeave());
    canvas.addEventListener('mouseenter', (e) => this._onEnter(e));

    // touch events
    canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', () => this._onLeave());
  }

  _canvasXY(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // --- desktop handlers (unchanged) ---

  _onMove(e) {
    [this.x, this.y] = this._canvasXY(e);
    this.inCanvas = true;
    this.lastMoveTime = performance.now();
    this.idleTimer = 0;
    if (this.onMove) this.onMove(this.x, this.y);
    if (this.state === STATE.IDLE) {
      const idleDuration = performance.now() - this._idleSince;
      this.state = STATE.ACTIVE;
      if (this.onActivate) this.onActivate(idleDuration);
    }
  }

  _onClick(e) {
    [this.x, this.y] = this._canvasXY(e);
    this.state = STATE.SCATTER;
    this.scatterTimer = this.params.scatterDuration;
    this.scatterDecay = 1.0;
  }

  _onLeave() {
    this.inCanvas = false;
    this.state = STATE.IDLE;
    this._idleSince = performance.now();
  }

  _onEnter(e) {
    this.inCanvas = true;
    [this.x, this.y] = this._canvasXY(e);
  }

  // --- touch handlers ---

  _onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    [this._touchStartX, this._touchStartY] = this._canvasXY(t);
    this._touchStartTime = performance.now();
    this._touchMoved = false;
    this._touchFingers = e.touches.length;
    this.inCanvas = true;
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const [tx, ty] = this._canvasXY(t);
    const dx = tx - this._touchStartX;
    const dy = ty - this._touchStartY;

    if (!this._touchMoved && dx * dx + dy * dy > 100) {
      this._touchMoved = true;
    }

    if (this._touchMoved) {
      this.x = tx;
      this.y = ty;
      this.lastMoveTime = performance.now();
      this.idleTimer = 0;
      if (this.onMove) this.onMove(this.x, this.y);
      if (this.state === STATE.IDLE) {
        const idleDuration = performance.now() - this._idleSince;
        this.state = STATE.ACTIVE;
        if (this.onActivate) this.onActivate(idleDuration);
      }
    }
  }

  _onTouchEnd(e) {
    e.preventDefault();
    const duration = performance.now() - this._touchStartTime;

    if (!this._touchMoved && duration < 300) {
      if (this._touchFingers >= 2) {
        // two-finger tap
        const now = performance.now();
        if (now - this._lastTwoFingerTapTime < 500) {
          if (this.onDoubleTwoFingerTap) this.onDoubleTwoFingerTap();
          this._lastTwoFingerTapTime = 0;
        } else {
          this._lastTwoFingerTapTime = now;
        }
      } else {
        // single-finger tap = click
        this.x = this._touchStartX;
        this.y = this._touchStartY;
        this.state = STATE.SCATTER;
        this.scatterTimer = this.params.scatterDuration;
        this.scatterDecay = 1.0;
        if (this.onTap) this.onTap(this._touchStartX, this._touchStartY);
      }
    } else {
      // slide ended
      this._onLeave();
    }
  }

  // --- update ---

  update(dtMs) {
    if (this.state === STATE.ACTIVE) {
      this.idleTimer += dtMs;
      if (this.idleTimer >= this.params.idleTimeout) {
        this.state = STATE.IDLE;
        this._idleSince = performance.now();
      }
    } else if (this.state === STATE.SCATTER) {
      this.scatterTimer -= dtMs;
      this.scatterDecay = Math.max(0, this.scatterTimer / this.params.scatterDuration);
      if (this.scatterTimer <= 0) {
        const timeSinceMove = performance.now() - this.lastMoveTime;
        this.state = timeSinceMove < 500 ? STATE.ACTIVE : STATE.IDLE;
        this.idleTimer = 0;
      }
    }
  }

  isIdle() { return this.state === STATE.IDLE; }
  isActive() { return this.state === STATE.ACTIVE; }
  isScattering() { return this.state === STATE.SCATTER; }
}
