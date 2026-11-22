/**
 * Below-decks ambience made on the fly with Web Audio (no sound files):
 * water lapping on the hull, wooden creaks as the boat rolls, and a ship's bell now and then.
 * Browsers only allow sound after a tap, so start() must be called from a tap or click.
 */
export class ShipSounds {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timers: number[] = [];
  private bellTimer = 0;

  get running() {
    return !!this.ctx && this.ctx.state === "running";
  }

  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2); // fade in
    this.master.connect(ctx.destination);
    this.water();
    this.scheduleBell(8 + Math.random() * 10);
  }

  /** Quiet while the app is in the background. */
  pause() {
    void this.ctx?.suspend();
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    clearTimeout(this.bellTimer);
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  /** Called at the end of each roll: the boat's joinery takes the load and creaks. */
  rollPeak(strength: number) {
    // Only the real ends of a roll creak (not the small wobbles), and not every time.
    if (!this.ctx || strength < 0.5) return;
    if (Math.random() < 0.65) this.creak(0.5 + strength * 0.5);
    // Now and then a second, smaller creak from somewhere else in the boat.
    if (Math.random() < 0.35) this.later(() => this.creak(0.35), 250 + Math.random() * 700);
  }

  // ── Water ───────────────────────────────────────────────────────────────────────────────

  private noiseBuffer(seconds: number, brown = false) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else data[i] = white;
    }
    return buf;
  }

  /** Low, slow washing of water along the hull, swelling with each wave. */
  private water() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(6, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.32;
    // Waves: a slow wobble on the volume and brightness.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.16;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain).connect(gain.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.23;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 160;
    lfo2.connect(lfo2Gain).connect(lp.frequency);
    src.connect(lp).connect(gain).connect(this.master!);
    src.start();
    lfo.start();
    lfo2.start();
    this.lap();
  }

  /** Little slaps of water against the topsides, at random. */
  private lap() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.6);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(700 + Math.random() * 500, t);
    bp.frequency.exponentialRampToValueAtTime(250, t + 0.5);
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t);
    this.later(() => this.lap(), 900 + Math.random() * 2600);
  }

  // ── Creaks ──────────────────────────────────────────────────────────────────────────────

  /**
   * A wooden creak: a train of tiny "stick-slip" clicks that speeds up then slows down,
   * rung through a couple of resonant filters like a timber panel.
   */
  private creak(level: number) {
    const ctx = this.ctx!;
    const dur = 0.35 + Math.random() * 0.6;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    const base = 35 + Math.random() * 60; // clicks per second
    let t = 0;
    while (t < dur) {
      const p = t / dur;
      const rate = base * (0.6 + Math.sin(p * Math.PI) * 0.9);
      const i = Math.floor(t * ctx.sampleRate);
      const amp = Math.sin(p * Math.PI) * (0.6 + Math.random() * 0.4);
      for (let k = 0; k < 40 && i + k < data.length; k++) data[i + k] += amp * Math.exp(-k / 6) * (k % 2 ? -1 : 1);
      t += (1 / rate) * (0.8 + Math.random() * 0.4);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const out = ctx.createGain();
    out.gain.value = 0.32 * level;
    for (const [f, q] of [[320 + Math.random() * 200, 9], [900 + Math.random() * 500, 6]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = q;
      src.connect(bp).connect(out);
    }
    // Pan a little left or right: creaks come from all over the boat.
    const pan = ctx.createStereoPanner?.();
    if (pan) {
      pan.pan.value = Math.random() * 1.4 - 0.7;
      out.connect(pan).connect(this.master!);
    } else out.connect(this.master!);
    src.start();
  }

  // ── Bell ────────────────────────────────────────────────────────────────────────────────

  private scheduleBell(seconds: number) {
    this.bellTimer = window.setTimeout(() => {
      if (!this.ctx) return;
      // Ship's bells ring in pairs: ding-ding (sometimes two pairs).
      const pairs = Math.random() < 0.4 ? 2 : 1;
      for (let p = 0; p < pairs; p++) {
        this.bell(p * 1.4);
        this.bell(p * 1.4 + 0.38);
      }
      this.scheduleBell(30 + Math.random() * 45);
    }, seconds * 1000);
  }

  /** One strike of a brass bell: a handful of out-of-tune partials that ring and fade. */
  private bell(delay: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const f0 = 620;
    const out = ctx.createGain();
    out.gain.value = 0.08;
    // A touch of distance: the bell is up in the cockpit.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    out.connect(lp).connect(this.master!);
    const partials: [number, number, number][] = [
      // [ratio to f0, loudness, seconds to fade]
      [0.5, 0.35, 3.5], [1, 1, 3], [1.19, 0.45, 2.2], [1.5, 0.35, 1.8], [2.0, 0.5, 1.6], [2.74, 0.25, 1.1], [3.76, 0.15, 0.7],
    ];
    for (const [ratio, amp, decay] of partials) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f0 * ratio * (1 + (Math.random() - 0.5) * 0.002);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + decay + 0.1);
    }
    // The clapper's "tink".
    const click = ctx.createBufferSource();
    click.buffer = this.noiseBuffer(0.03);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.25, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    click.connect(hp).connect(cg).connect(out);
    click.start(t);
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(() => { if (this.ctx) fn(); }, ms));
    if (this.timers.length > 50) this.timers.splice(0, 25);
  }
}
