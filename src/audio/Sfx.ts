import { BRICKS } from "../sim/config";

/**
 * Every sound, synthesised at runtime. No files, no fetch, nothing to 404, and
 * the whole audio layer costs nothing to load.
 *
 * It also does a job no sample could. The paddle's outgoing angle comes from
 * *where* the ball landed on it (ADR 0002), and that is the central mechanic
 * and the one thing a player cannot see happening — the ball simply leaves at
 * an angle. So the paddle's sound is panned to the impact point and pitched by
 * it: catch the ball on the left and you hear it on the left, catch it dead
 * centre and it sits in the middle. The player learns to aim without a line of
 * text explaining that they can.
 *
 * Nothing here can reach the simulation. Sfx reads contacts and never writes,
 * so a muted run is bit-identical to a loud one.
 */

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const noteHz = (step: number) => 196 * 2 ** (SCALE[Math.min(step, SCALE.length - 1)] / 12);

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  muted = false;

  /** Audio cannot start before a gesture; safe to call on every one. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.25;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /**
   * One decaying voice, optionally placed in the stereo field. `pan` runs -1
   * (left) to 1 (right) and is what carries the paddle's impact point.
   */
  private blip(
    type: OscillatorType,
    hz: number,
    gain: number,
    seconds: number,
    { pan = 0, delay = 0 }: { pan?: number; delay?: number } = {},
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;

    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);

    // Ramp to a floor rather than zero: exponentialRamp cannot reach 0, and a
    // linear tail on a percussive envelope reads as a click.
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);

    let tail: AudioNode = env;
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
      env.connect(panner);
      tail = panner;
    }

    osc.connect(env);
    tail.connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  /**
   * A brick. Pitched by row, so clearing a board top-down walks *down* the
   * scale — the rows are worth different amounts and now sound it.
   */
  brick(row: number, broken: boolean, speed: number) {
    const force = Math.min(1, speed / 700);
    if (!broken) {
      // Cracked but alive: duller and lower, so damage and death never sound
      // the same. Otherwise a two-hit brick reads as a bug the first time.
      this.blip("sine", 150 + force * 60, 0.16, 0.07);
      return;
    }
    const step = BRICKS.rows - 1 - row;
    this.blip("triangle", noteHz(step + 2), 0.20 + force * 0.12, 0.13);
    this.blip("sine", noteHz(step + 2) * 2, 0.07, 0.09);
  }

  /**
   * The paddle, panned and pitched by where it was struck. This is the mechanic
   * made audible: the edges are where the angle comes from, so the edges are
   * where the sound goes.
   */
  paddle(offset: number, speed: number) {
    const force = Math.min(1, speed / 700);
    this.blip("square", 200 + Math.abs(offset) * 190, 0.13 + force * 0.1, 0.075, {
      pan: offset * 0.85,
    });
  }

  wall(speed: number) {
    const force = Math.min(1, speed / 700);
    this.blip("triangle", 320 + force * 220, 0.07 + force * 0.05, 0.045);
  }

  /** A life. Falling, and low enough that it cannot be mistaken for a hit. */
  lost() {
    this.blip("sawtooth", 180, 0.20, 0.30);
    this.blip("sine", 120, 0.22, 0.42, { delay: 0.09 });
    this.blip("sine", 80, 0.20, 0.50, { delay: 0.20 });
  }

  cleared() {
    for (let i = 0; i < 6; i++) {
      this.blip("triangle", noteHz(i + 3), 0.20, 0.34, { delay: i * 0.075 });
      this.blip("sine", noteHz(i + 6), 0.10, 0.30, { delay: i * 0.075 });
    }
  }

  launch() {
    this.blip("sine", 300, 0.12, 0.10);
    this.blip("sine", 450, 0.10, 0.12, { delay: 0.05 });
  }
}
