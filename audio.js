export class AudioManager {
  constructor() {
    this.scatterSound = new Audio('audio/scatter.wav');
    this.clickSound = new Audio('audio/click.wav');
    this.bgmSound = new Audio('audio/bgm.wav');
    this.bgmSound.loop = true;

    this.clickSound.volume = 0.3;
    this.firstClick = true;
    this.loopStarted = false;
    this._baseVolume = 0.4;
    this._depthVolume = 0.5;

    this.followSound = new Audio('audio/scatter.wav');
    this._lastFollowTime = 0;

    this._audioCtx = null;
    this._loopBuffer = null;
    this._loopGain = null;
    this._loopSource = null;
    this._muted = false;
    this._bgmWasPlaying = false;
    this._needsResume = false;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._suspend();
      else this._resume();
    });
    window.addEventListener('blur', () => this._suspend());
    window.addEventListener('focus', () => this._resume());
  }

  _suspend() {
    if (this._muted) return;
    this._muted = true;
    this._bgmWasPlaying = !this.bgmSound.paused;
    this.bgmSound.pause();
    if (this._audioCtx && this._audioCtx.state === 'running') {
      this._audioCtx.suspend().catch(() => {});
    }
  }

  _resume() {
    if (!this._muted) return;
    this._muted = false;
    if (this._audioCtx && this._audioCtx.state === 'suspended') {
      this._audioCtx.resume().catch(() => {});
    }
    if (this._bgmWasPlaying) {
      this.bgmSound.play().catch(() => {
        this._needsResume = true;
      });
    }
  }

  _tryResumeOnInteraction() {
    if (!this._needsResume) return;
    this._needsResume = false;
    if (this._audioCtx && this._audioCtx.state === 'suspended') {
      this._audioCtx.resume().catch(() => {});
    }
    if (this._bgmWasPlaying && this.bgmSound.paused) {
      this.bgmSound.play().catch(() => {});
    }
  }

  async _initLoopBuffer() {
    this._audioCtx = new AudioContext();
    this._loopGain = this._audioCtx.createGain();
    this._loopGain.gain.value = this._baseVolume;
    this._loopGain.connect(this._audioCtx.destination);

    const resp = await fetch('audio/loop.wav');
    const arrayBuf = await resp.arrayBuffer();
    this._loopBuffer = await this._audioCtx.decodeAudioData(arrayBuf);
  }

  _playLoop() {
    if (!this._loopBuffer || !this._audioCtx) return;
    const source = this._audioCtx.createBufferSource();
    source.buffer = this._loopBuffer;
    source.loop = true;
    source.connect(this._loopGain);
    source.start(0);
    this._loopSource = source;
  }

  onClick() {
    this._tryResumeOnInteraction();
    this.scatterSound.currentTime = 0;
    this.scatterSound.volume = this.firstClick ? 0.8 : 0.5;
    this.scatterSound.play().catch(() => {});

    if (!this.firstClick) {
      this.clickSound.currentTime = 0;
      this.clickSound.play().catch(() => {});
    }

    if (this.firstClick) {
      this.firstClick = false;
      this.bgmSound.play().catch(() => {});

      this._initLoopBuffer().then(() => {
        this.scatterSound.addEventListener('ended', () => {
          this.loopStarted = true;
          this._playLoop();
        }, { once: true });
      });
    }
  }

  onFollow() {
    this._tryResumeOnInteraction();
    setTimeout(() => {
      this.followSound.currentTime = 0;
      this.followSound.volume = 0.2;
      this.followSound.play().catch(() => {});
    }, 200);
  }

  fadeOut(duration = 2000) {
    const start = performance.now();
    const initBgm = this.bgmSound.volume;
    const initGain = this._loopGain ? this._loopGain.gain.value : 0;

    this.fadeComplete = false;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const v = 1 - t;
      this.bgmSound.volume = initBgm * v;
      if (this._loopGain) this._loopGain.gain.value = initGain * v;
      if (t < 1) requestAnimationFrame(step);
      else this.fadeComplete = true;
    };
    requestAnimationFrame(step);
  }

  reset() {
    this.bgmSound.pause(); this.bgmSound.currentTime = 0; this.bgmSound.volume = 1;
    this.scatterSound.pause(); this.scatterSound.currentTime = 0;
    this.clickSound.pause(); this.clickSound.currentTime = 0;
    this.followSound.pause(); this.followSound.currentTime = 0;
    if (this._loopSource) { try { this._loopSource.stop(); } catch(e){} this._loopSource = null; }
    if (this._audioCtx) { this._audioCtx.close(); this._audioCtx = null; this._loopGain = null; this._loopBuffer = null; }
    this.firstClick = true;
    this.loopStarted = false;
    this._depthVolume = 0.5;
    this._muted = false;
    this._needsResume = false;
  }

  updateVolume(avgZ, depthRange) {
    if (!this.loopStarted || !this._loopGain || this._muted) return;
    const depthT = (avgZ + depthRange) / (2 * depthRange);
    const target = 0.3 + Math.max(0, Math.min(1, depthT)) * 0.7;
    this._depthVolume += (target - this._depthVolume) * 0.15;
    this._loopGain.gain.value = this._baseVolume * this._depthVolume;
  }
}
