/** Quiet procedural sound, enabled only by an explicit user gesture. No assets or API calls. */
export class ValleyAudio {
  private context: AudioContext;
  private gain: GainNode;
  private ambience: AudioBufferSourceNode;
  private timer: number | undefined;
  private enabled = false;
  private paused = false;
  constructor() {
    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.context.destination);
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    let seed = 1729;
    for (let i = 0; i < samples.length; i++) { seed = (seed * 16807) % 2147483647; samples[i] = (seed / 2147483647 - 0.5) * 0.07; }
    this.ambience = this.context.createBufferSource();
    this.ambience.buffer = buffer;
    this.ambience.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 850;
    this.ambience.connect(filter); filter.connect(this.gain); this.ambience.start();
    this.timer = window.setInterval(() => { if (this.enabled && !this.paused) this.strike(); }, 2300);
  }
  async setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) await this.context.resume();
    this.updateGain();
  }
  setPaused(paused: boolean) { this.paused = paused; this.updateGain(); }
  private updateGain() { this.gain.gain.setTargetAtTime(this.enabled && !this.paused ? 0.5 : 0, this.context.currentTime, 0.15); }
  private strike() {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(420, now + 0.09);
    envelope.gain.setValueAtTime(0.045, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    oscillator.connect(envelope); envelope.connect(this.gain);
    oscillator.start(now); oscillator.stop(now + 0.2);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  dispose() { window.clearInterval(this.timer); this.ambience.stop(); void this.context.close(); }
}
