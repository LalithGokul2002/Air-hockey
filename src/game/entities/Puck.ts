import { PHYSICS, PUCK } from '../config';

import { Vector2 } from '../physics/Vector2';

export class Puck {
  readonly radius =
    PUCK.radius;

  readonly mass =
    PUCK.mass;

  readonly position =
    new Vector2();

  /**
   * Position at the start of the current tick,
   * used to interpolate rendering.
   */
  readonly previousPosition =
    new Vector2();

  readonly velocity =
    new Vector2();

  get speed(): number {
    return this.velocity.magnitude();
  }

  reset(
    x: number,
    y: number,
  ): void {
    this.position.set(
      x,
      y,
    );

    this.previousPosition.set(
      x,
      y,
    );

    this.velocity.set(
      0,
      0,
    );
  }

  storePrevious(): void {
    this.previousPosition.copy(
      this.position,
    );
  }

  integrate(
    dt: number,
  ): void {
    if (dt <= 0) {
      return;
    }

    /*
     * Integrate position using the current velocity.
     *
     * addScaledInPlace() avoids creating a temporary
     * Vector2 on every physics tick.
     */
    this.position.addScaledInPlace(
      this.velocity,
      dt,
    );

    /*
     * Apply frame-rate-independent exponential damping.
     *
     * Skip the calculation when the puck is already
     * stationary.
     */
    if (
      this.velocity.x !== 0 ||
      this.velocity.y !== 0
    ) {
      const damping =
        Math.pow(
          PHYSICS.puckDamping,
          dt,
        );

      this.velocity.scaleInPlace(
        damping,
      );
    }
  }
}