export class Soundscape {
  private ctx: AudioContext | null = null;
  private drone: GainNode | null = null;
  private notes: OscillatorNode[] = [];
  muted = true;
  async enable(enabled: boolean) {
    this.muted = !enabled;
    if (!enabled) { this.notes.forEach(n => n.stop()); this.notes=[]; this.drone=null; return; }
    try {
      this.ctx ??= new AudioContext();
      await this.ctx.resume();
      if (this.drone) return;
      this.drone=this.ctx.createGain(); this.drone.gain.value=.015;this.drone.connect(this.ctx.destination);
      for (const frequency of [55,82.41,110.1]) { const note=this.ctx.createOscillator();note.type='sine';note.frequency.value=frequency;note.connect(this.drone);note.start();this.notes.push(note); }
    } catch { this.muted=true; }
  }
  play(kind: 'select' | 'cast' | 'hit' | 'win' | 'turn') {
    if(this.muted||!this.ctx)return;
    const ctx=this.ctx;const tone=ctx.createOscillator();const gain=ctx.createGain();const now=ctx.currentTime;
    const freq={select:350,cast:590,hit:90,win:660,turn:180}[kind];tone.type=kind==='hit'?'triangle':'sine';tone.frequency.setValueAtTime(freq,now);tone.frequency.exponentialRampToValueAtTime(kind==='win'?990:freq*.55,now+.2);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.07,now+.01);gain.gain.exponentialRampToValueAtTime(.0001,now+.25);tone.connect(gain);gain.connect(ctx.destination);tone.start();tone.stop(now+.28);
  }
}
