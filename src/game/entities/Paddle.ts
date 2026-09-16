import type { Side } from '../../types/game';
import { PADDLE } from '../config';
import { clamp } from '../physics/math';
import { Vector2 } from '../physics/Vector2';

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class Paddle {
  readonly radius =
    PADDLE.radius;

  readonly side: Side;
  readonly bounds: Bounds;

  maxSpeed: number;

  readonly position =
    new Vector2();

  readonly previousPosition =
    new Vector2();

  readonly velocity =
    new Vector2();

  readonly target =
    new Vector2();

  constructor(
    side: Side,
    bounds: Bounds,
    maxSpeed: number,
  ) {
    this.side = side;
    this.bounds = bounds;
    this.maxSpeed = maxSpeed;
  }

  reset(
    x: number,
    y: number,
  ): void {
    this.setTarget(
      x,
      y,
    );

    this.position.copy(
      this.target,
    );

    this.previousPosition.copy(
      this.target,
    );

    this.velocity.set(
      0,
      0,
    );
  }

  setTarget(
    x: number,
    y: number,
  ): void {
    const b =
      this.bounds;

    this.target.set(
      clamp(
        x,
        b.minX,
        b.maxX,
      ),
      clamp(
        y,
        b.minY,
        b.maxY,
      ),
    );
  }

  storePrevious(): void {
    this.previousPosition.copy(
      this.position,
    );
  }

  update(
    dt: number,
  ): void {
    if (dt <= 0) {
      this.velocity.set(
        0,
        0,
      );

      return;
    }

    let dx =
      this.target.x -
      this.position.x;

    let dy =
      this.target.y -
      this.position.y;

    /*
     * Use squared distance first so a paddle that is
     * effectively already at its target avoids sqrt.
     */
    const distanceSq =
      dx * dx +
      dy * dy;

    if (
      distanceSq <=
      0.001 * 0.001
    ) {
      this.position.copy(
        this.target,
      );

      this.velocity.set(
        0,
        0,
      );

      return;
    }

    const distance =
      Math.sqrt(
        distanceSq,
      );

    const maxStep =
      Math.max(
        0,
        this.maxSpeed,
      ) * dt;

    /*
     * Move directly toward the target at capped speed.
     */
    if (
      distance >
      maxStep
    ) {
      /*
       * If maxSpeed is zero, the paddle cannot move.
       */
      if (
        maxStep <= 0
      ) {
        this.velocity.set(
          0,
          0,
        );

        return;
      }

      const scale =
        maxStep /
        distance;

      dx *= scale;
      dy *= scale;
    }

    this.velocity.set(
      dx / dt,
      dy / dt,
    );

    this.position.x +=
      dx;

    this.position.y +=
      dy;

    /*
     * Keep inside the paddle's bounds.
     */
    const b =
      this.bounds;

    this.position.x =
      clamp(
        this.position.x,
        b.minX,
        b.maxX,
      );

    this.position.y =
      clamp(
        this.position.y,
        b.minY,
        b.maxY,
      );

    /*
     * If clamping stopped the paddle against
     * a boundary, don't retain velocity in
     * that direction.
     */
    if (
      this.position.x ===
        b.minX ||
      this.position.x ===
        b.maxX
    ) {
      this.velocity.x = 0;
    }

    if (
      this.position.y ===
        b.minY ||
      this.position.y ===
        b.maxY
    ) {
      this.velocity.y = 0;
    }
  }

  nudge(
    dx: number,
    dy: number,
  ): void {
    const b =
      this.bounds;

    this.position.set(
      clamp(
        this.position.x +
          dx,
        b.minX,
        b.maxX,
      ),
      clamp(
        this.position.y +
          dy,
        b.minY,
        b.maxY,
      ),
    );
  }
}