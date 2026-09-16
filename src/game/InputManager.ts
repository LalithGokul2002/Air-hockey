import { Vector2 } from './physics/Vector2';

type ToWorld = (clientX: number, clientY: number, out: Vector2) => Vector2;

/**
 * Turns mouse / touch / pen input into a world-space target for the player's paddle.
 * Pointer events cover all three input types with one code path.
 */
export class InputManager {
  /** Latest pointer position in world space, or null before the first move. */
  pointer: Vector2 | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly toWorld: ToWorld;
  /** Reused for every event: high-rate mice can fire pointermove hundreds of times a second. */
  private readonly worldPosition = new Vector2();

  constructor(canvas: HTMLCanvasElement, toWorld: ToWorld) {
    this.canvas = canvas;
    this.toWorld = toWorld;
    // Listen on window so the paddle keeps tracking if the mouse drifts off the canvas.
    window.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
  }

  detach(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
  }

  private track(e: PointerEvent): void {
    this.pointer = this.toWorld(e.clientX, e.clientY, this.worldPosition);
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.track(e);
  };

  private onPointerDown = (e: PointerEvent): void => {
    // Keeps a touch drag bound to the canvas even if the finger slides off it.
    this.canvas.setPointerCapture(e.pointerId);
    this.track(e);
  };
}
