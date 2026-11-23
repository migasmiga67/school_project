/**
 * In-car radio. Every station is generated live with Web Audio: original loops,
 * no recordings. Plays only while the player drives with a station tuned in.
 */
import type { RadioStationId } from './phone-apps';

interface Style { bpm: number; chords: number[][]; bass: 'saw' | 'sine' | 'sub'; lead: OscillatorType; hats: number; swing: number; kick: number[]; snare: number[] }
const n = (semitones: number) => 220 * 2 ** (semitones / 12);
const STYLES: Record<RadioStationId, Style> = {
  neon: { bpm: 104, chords: [[-12, -5, 0, 3], [-16, -9, -4, 0], [-19, -12, -7, -3], [-14, -7, -2, 2]], bass: 'saw', lead: 'square', hats: 8, swing: 0, kick: [0, 4, 8, 12], snare: [4, 12] },
  chill: { bpm: 78, chords: [[-10, -3, 2, 5], [-15, -8, -3, 0], [-12, -5, 0, 4], [-17, -10, -5, -1]], bass: 'sine', lead: 'triangle', hats: 4, swing: .18, kick: [0, 7, 10], snare: [4, 12] },
  street: { bpm: 140, chords: [[-21, -9, -6, -2], [-21, -9, -6, -2], [-23, -11, -8, -4], [-18, -6, -3, 1]], bass: 'sub', lead: 'sine', hats: 16, swing: 0, kick: [0, 3, 10], snare: [8] },
};

export class CarRadio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextAt = 0;
  private playing: RadioStationId | null = null;
  private noise: AudioBuffer | null = null;
  station: RadioStationId | null = null;
  volume = .5;

  /** Must be called from a user gesture the first time (browser autoplay rules). */
  tune(station: RadioStationId | null) {
    this.station = station;
    if (station) { try { this.context ??= new AudioContext(); void this.context.resume(); } catch { this.context = null; } }
  }
  get available() { return typeof AudioContext !== 'undefined'; }
  /** Called each frame: plays while `audible`, fades out otherwise. */
  update(audible: boolean) {
    const want = audible && this.station && this.context ? this.station : null;
    if (want === this.playing) return;
    this.stop();
    if (!want || !this.context) return;
    const c = this.context;
    this.master = c.createGain(); this.master.gain.value = 0; this.master.gain.setTargetAtTime(.11 * this.volume, c.currentTime, .4);
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = want === 'chill' ? 2600 : 7000;
    this.master.connect(filter); filter.connect(c.destination);
    this.playing = want; this.step = 0; this.nextAt = c.currentTime + .08;
    this.timer = setInterval(() => this.schedule(), 60);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.master && this.context) { const old = this.master; old.gain.setTargetAtTime(0, this.context.currentTime, .15); setTimeout(() => old.disconnect(), 600); }
    this.master = null; this.playing = null;
  }
  private schedule() {
    const c = this.context, out = this.master, id = this.playing;
    if (!c || !out || !id) return;
    const style = STYLES[id], sixteenth = 60 / style.bpm / 4;
    while (this.nextAt < c.currentTime + .25) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % style.chords.length, chord = style.chords[bar];
      const t = this.nextAt + (s % 2 ? style.swing * sixteenth : 0);
      if (style.kick.includes(s)) this.kick(t, id === 'street' ? .5 : .32);
      if (style.snare.includes(s)) this.snare(t, id === 'chill' ? .06 : .12);
      if (s % (16 / style.hats) === 0) this.hat(t, s % 4 === 2 ? .045 : .025);
      if (id === 'street' && this.step % 32 >= 28) this.hat(t + sixteenth / 2, .02);
      if (s === 0) for (const note of chord) this.tone(t, n(note + 12), sixteenth * 15, id === 'neon' ? 'sawtooth' : 'triangle', .022, .3);
      if (style.bass === 'saw' && s % 2 === 0) this.tone(t, n(chord[0] - 12), sixteenth * 1.8, 'sawtooth', .07, .01);
      if (style.bass === 'sine' && (s === 0 || s === 10)) this.tone(t, n(chord[0] - 12), sixteenth * 6, 'sine', .14, .02);
      if (style.bass === 'sub' && style.kick.includes(s)) this.tone(t, n(chord[0] - 12), sixteenth * 3, 'sine', .22, .005, n(chord[0] - 17));
      const melody = [2, 1, 3, 2, 0, 3, 1, 2][(Math.floor(this.step / 2) + bar) % 8];
      if ((id === 'neon' && s % 4 === 2) || (id === 'chill' && (s === 6 || s === 14)) || (id === 'street' && s === 12 && bar % 2)) this.tone(t, n(chord[melody] + 24), sixteenth * (id === 'chill' ? 4 : 1.6), style.lead, id === 'neon' ? .025 : .035, .01);
      this.nextAt += sixteenth; this.step++;
    }
  }
  private tone(t: number, freq: number, length: number, type: OscillatorType, level: number, attack: number, slideTo?: number) {
    const c = this.context!, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + length);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + length);
    o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + length + .05);
  }
  private kick(t: number, level: number) {
    const c = this.context!, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(.0001, t + .3);
    o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + .32);
  }
  private noiseBuffer() {
    if (this.noise) return this.noise;
    const c = this.context!, buffer = c.createBuffer(1, c.sampleRate * .3, c.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return this.noise = buffer;
  }
  private burst(t: number, level: number, length: number, frequency: number, type: BiquadFilterType) {
    const c = this.context!, source = c.createBufferSource(), filter = c.createBiquadFilter(), g = c.createGain();
    source.buffer = this.noiseBuffer(); filter.type = type; filter.frequency.value = frequency;
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(.0001, t + length);
    source.connect(filter); filter.connect(g); g.connect(this.master!); source.start(t); source.stop(t + length + .02);
  }
  private snare(t: number, level: number) { this.burst(t, level, .18, 1800, 'bandpass'); }
  private hat(t: number, level: number) { this.burst(t, level, .05, 8000, 'highpass'); }
}
