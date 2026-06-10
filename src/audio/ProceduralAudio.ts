/**
 * All sound is synthesized at runtime with WebAudio oscillators and shaped
 * noise. No audio files exist in the project.
 */
export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambientNodes: AudioNode[] = [];

  /** Must be called from a user gesture (menu click) to satisfy autoplay policy. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    delay = 0
  ): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, filterFreq: number, delay = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Faint facility room tone: two detuned saws through a heavy lowpass. */
  private startAmbient(): void {
    if (!this.ctx || !this.master) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 110;
    const g = this.ctx.createGain();
    g.gain.value = 0.028;
    filter.connect(g).connect(this.master);
    for (const f of [48, 48.7]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.connect(filter);
      osc.start();
      this.ambientNodes.push(osc);
    }
  }

  portalFire(kind: 'blue' | 'amber'): void {
    const base = kind === 'blue' ? 760 : 540;
    this.tone('sawtooth', base, base * 2.6, 0.16, 0.16);
    this.tone('sine', base * 0.5, base * 1.4, 0.2, 0.14);
    this.noise(0.1, 0.06, 4500);
  }

  portalOpen(kind: 'blue' | 'amber'): void {
    const base = kind === 'blue' ? 330 : 250;
    this.tone('sine', base * 0.6, base * 2.2, 0.4, 0.18);
    this.tone('triangle', base * 2, base * 3.2, 0.3, 0.1, 0.04);
    this.noise(0.25, 0.05, 2200, 0.02);
  }

  invalidShot(): void {
    this.tone('square', 220, 140, 0.12, 0.1);
    this.tone('square', 165, 110, 0.14, 0.08, 0.07);
  }

  teleport(): void {
    this.tone('sine', 180, 980, 0.22, 0.2);
    this.tone('sine', 900, 240, 0.25, 0.12, 0.05);
    this.noise(0.18, 0.1, 6000);
  }

  pickup(): void {
    this.tone('sine', 420, 660, 0.1, 0.12);
  }

  drop(): void {
    this.tone('sine', 520, 300, 0.12, 0.1);
  }

  buttonDown(): void {
    this.tone('sine', 240, 150, 0.16, 0.18);
    this.tone('sine', 620, 880, 0.2, 0.1, 0.1);
  }

  buttonUp(): void {
    this.tone('sine', 170, 250, 0.14, 0.12);
  }

  doorOpen(): void {
    this.noise(0.5, 0.09, 1400);
    this.tone('sine', 130, 320, 0.45, 0.1);
    this.tone('triangle', 700, 1100, 0.18, 0.07, 0.32);
  }

  doorClose(): void {
    this.noise(0.4, 0.08, 1100);
    this.tone('sine', 300, 120, 0.4, 0.1);
  }

  jump(): void {
    this.noise(0.07, 0.04, 1800);
  }

  land(intensity: number): void {
    this.noise(0.12, Math.min(0.14, 0.04 + intensity * 0.05), 900);
  }

  levelComplete(): void {
    const seq = [392, 523, 659, 784];
    seq.forEach((f, i) => this.tone('sine', f, f, 0.3, 0.14, i * 0.11));
    this.tone('triangle', 1568, 1568, 0.5, 0.06, 0.44);
  }

  uiClick(): void {
    this.tone('sine', 880, 990, 0.06, 0.08);
  }

  respawn(): void {
    this.tone('sawtooth', 300, 90, 0.35, 0.1);
    this.noise(0.3, 0.06, 800);
  }
}
