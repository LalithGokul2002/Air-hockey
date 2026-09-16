export interface LoopCallbacks {
  /** Advance the simulation by exactly `dt` seconds. */
  update(dt: number): void;
  /** Draw a frame. `alpha` (0..1) is how far we are between the last two ticks. */
  render(alpha: number): void;
}

/** Longest frame we'll try to catch up on (e.g. after the tab was in the background). */
const MAX_FRAME_SECONDS = 0.25;
/** Cap on ticks per frame, so a slow device can't fall into a "spiral of death". */
const MAX_STEPS_PER_FRAME = 5;

/**
 * Fixed-timestep game loop.
 *
 * Rendering runs at the display's refresh rate (60/120/144 Hz) via requestAnimationFrame,
 * while physics always ticks at a fixed rate, so the simulation behaves the same on
 * every machine.
 */
export class GameLoop {
  readonly fixedDt: number;
  /** Frames per second, updated twice a second. */
  fps = 0;
  /** Duration of the last frame in milliseconds. */
  frameTime = 0;

  private readonly callbacks: LoopCallbacks;
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;
  private fpsFrames = 0;
  private fpsTimer = 0;

  constructor(callbacks: LoopCallbacks, tickRate: number) {
    this.callbacks = callbacks;
    this.fixedDt = 1 / tickRate;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private frame = (now: number): void => {
    if (!this.running) return;

    // rAF's timestamp is the frame's start time, which can be slightly earlier than the
    // performance.now() taken in start(), so the first delta can be negative.
    const delta = Math.min(Math.max(0, (now - this.lastTime) / 1000), MAX_FRAME_SECONDS);
    this.lastTime = now;
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < MAX_STEPS_PER_FRAME) {
      this.callbacks.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    // Still behind after the cap: drop the whole ticks we can't afford, but keep the
    // fractional part so interpolation stays smooth.
    if (this.accumulator >= this.fixedDt) this.accumulator %= this.fixedDt;

    this.callbacks.render(this.accumulator / this.fixedDt);

    this.frameTime = delta * 1000;
    this.fpsFrames++;
    this.fpsTimer += delta;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    this.rafId = requestAnimationFrame(this.frame);
  };
}
