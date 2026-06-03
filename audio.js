const AUDIO_FILES = {
  scatter: 'audio/scatter.wav',
  click: 'audio/click.wav',
  bgm: 'audio/bgm.wav',
  loop: 'audio/loop.wav',
};

export class AudioManager {
  constructor() {
    this.firstClick = true;
    this.loopStarted = false;
    this._baseLoopVolume = 0.4;
    this._depthVolume = 0.5;
    this._lastFollowTime = 0;

    this._ctx = null;
    this._buffers = {};
    this._rawBuffers = {};
    this._gains = {};
    this._bgmSource = null;
    this._loopSource = null;
    this._muted = false;
    this._needsResume = false;
    this._initPromise = null;

    this._preloadPromise = this._preload();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._suspend();
      else this._resume();
    });
    window.addEventListener('blur', () => this._suspend());
    window.addEventListener('focus', () => this._resume());
  }

  async _preload() {
    const names = ['scatter', 'click', 'bgm', 'loop'];
    await Promise.all(names.map(async (name) => {
      const resp = await fetch(AUDIO_FILES[name]);
      this._rawBuffers[name] = await resp.arrayBuffer();
    }));
  }

  async _init() {
    if (this._ctx) return;
    await this._preloadPromise;
    this._ctx = new AudioContext();

    const names = ['scatter', 'click', 'bgm', 'loop'];
    const gainValues = { scatter: 0.5, click: 0.3, bgm: 1.0, loop: this._baseLoopVolume, follow: 0.2 };

    for (const name of names) {
      this._buffers[name] = await this._ctx.decodeAudioData(this._rawBuffers[name]);
    }
    this._buffers.follow = this._buffers.scatter;
    this._rawBuffers = {};

    for (const name of [...names, 'follow']) {
      const gain = this._ctx.createGain();
      gain.gain.value = gainValues[name] || 0.5;
      gain.connect(this._ctx.destination);
      this._gains[name] = gain;
    }
  }

  _playOneShot(name, volume) {
    if (!this._ctx || !this._buffers[name]) return;
    const src = this._ctx.createBufferSource();
    src.buffer = this._buffers[name];
    if (volume !== undefined) this._gains[name].gain.value = volume;
    src.connect(this._gains[name]);
    src.start(0);
    return src;
  }

  _playLooping(name) {
    if (!this._ctx || !this._buffers[name]) return null;
    const src = this._ctx.createBufferSource();
    src.buffer = this._buffers[name];
    src.loop = true;
    src.connect(this._gains[name]);
    src.start(0);
    return src;
  }

  _suspend() {
    if (this._muted || !this._ctx) return;
    this._muted = true;
    this._ctx.suspend().catch(() => {});
  }

  _resume() {
    if (!this._muted) return;
    this._muted = false;
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => { this._needsResume = true; });
    }
  }

  _tryResume() {
    if (!this._needsResume || !this._ctx) return;
    this._needsResume = false;
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  }

  onClick() {
    this._tryResume();

    if (this.firstClick) {
      this.firstClick = false;
      this._initPromise = this._init().then(() => {
        this._playOneShot('scatter', 0.8);
        this._bgmSource = this._playLooping('bgm');

        const scatterDur = this._buffers.scatter.duration;
        setTimeout(() => {
          this.loopStarted = true;
          this._loopSource = this._playLooping('loop');
        }, scatterDur * 1000);
      });
    } else {
      if (!this._initPromise) return;
      this._initPromise.then(() => {
        this._playOneShot('scatter', 0.5);
        this._playOneShot('click');
      });
    }
  }

  onFollow() {
    this._tryResume();
    if (!this._initPromise) return;
    this._initPromise.then(() => {
      setTimeout(() => {
        this._playOneShot('follow', 0.2);
      }, 200);
    });
  }

  fadeOut(duration = 2000) {
    if (!this._ctx) { this.fadeComplete = true; return; }
    const start = performance.now();
    const initGains = {};
    for (const name in this._gains) {
      initGains[name] = this._gains[name].gain.value;
    }

    this.fadeComplete = false;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const v = 1 - t;
      for (const name in this._gains) {
        this._gains[name].gain.value = initGains[name] * v;
      }
      if (t < 1) requestAnimationFrame(step);
      else this.fadeComplete = true;
    };
    requestAnimationFrame(step);
  }

  reset() {
    if (this._bgmSource) { try { this._bgmSource.stop(); } catch(e){} this._bgmSource = null; }
    if (this._loopSource) { try { this._loopSource.stop(); } catch(e){} this._loopSource = null; }
    if (this._ctx) { this._ctx.close().catch(() => {}); this._ctx = null; }
    this._buffers = {};
    this._gains = {};
    this.firstClick = true;
    this.loopStarted = false;
    this._depthVolume = 0.5;
    this._muted = false;
    this._needsResume = false;
    this._initPromise = null;
  }

  updateVolume(avgZ, depthRange) {
    if (!this.loopStarted || !this._gains.loop || this._muted) return;
    const depthT = (avgZ + depthRange) / (2 * depthRange);
    const target = 0.3 + Math.max(0, Math.min(1, depthT)) * 0.7;
    this._depthVolume += (target - this._depthVolume) * 0.15;
    this._gains.loop.gain.value = this._baseLoopVolume * this._depthVolume;
  }
}
