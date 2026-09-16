import { PHYSICS, TABLE } from '../config';
import type { Vector2 } from '../physics/Vector2';

export interface Prediction {
  /** X where the puck's centre will cross `lineY`. */
  x: number;

  /** Seconds until it gets there (Infinity if it never will). */
  time: number;
}

/**
 * Predict where a puck will cross a horizontal line.
 *
 * Uses a lightweight forward simulation so the prediction follows the same
 * damping model as the actual puck physics and handles side-wall bounces.
 *
 * This is intentionally separate from the real PhysicsEngine:
 * prediction is an AI estimate and must never modify the real game state.
 */
export function predictCrossing(
  position: Vector2,
  velocity: Vector2,
  lineY: number,
  radius: number,
): Prediction {
  const direction =
    lineY > position.y
      ? 1
      : -1;

  /*
   * If the puck isn't travelling toward the requested line,
   * there is currently no useful interception prediction.
   */
  if (
    Math.sign(velocity.y) !==
      direction ||
    Math.abs(velocity.y) < 1
  ) {
    return {
      x: position.x,
      time: Infinity,
    };
  }

  /*
   * Cache prediction constants outside the simulation loop.
   *
   * These values do not change during a single prediction,
   * so calculating them once avoids repeated work.
   */
  const maxPredictionTime =
    4;

  const simulationStep =
    1 / PHYSICS.tickRate;

  const damping =
    Math.pow(
      PHYSICS.puckDamping,
      simulationStep,
    );

  const wallRestitution =
    PHYSICS.wallRestitution;

  let x =
    position.x;

  let y =
    position.y;

  let vx =
    velocity.x;

  let vy =
    velocity.y;

  let elapsed =
    0;

  const minX =
    radius;

  const maxX =
    TABLE.width -
    radius;

  /*
   * Safety guard against an invalid physics configuration.
   */
  if (
    simulationStep <= 0 ||
    !Number.isFinite(
      simulationStep,
    )
  ) {
    return {
      x: position.x,
      time: Infinity,
    };
  }

  while (
    elapsed <
    maxPredictionTime
  ) {
    const previousX = x;
    const previousY = y;

    /*
     * Match Puck.integrate():
     *
     * position += velocity * dt
     */
    x +=
      vx *
      simulationStep;

    y +=
      vy *
      simulationStep;

    /*
     * Match Puck.integrate():
     *
     * velocity *= damping
     */
    vx *=
      damping;

    vy *=
      damping;

    /*
     * Handle side-wall collisions.
     */
    if (
      x < minX
    ) {
      x =
        minX;

      vx =
        Math.abs(vx) *
        wallRestitution;
    } else if (
      x > maxX
    ) {
      x =
        maxX;

      vx =
        -Math.abs(vx) *
        wallRestitution;
    }

    elapsed +=
      simulationStep;

    /*
     * Did the puck cross the requested defensive
     * line during this simulation step?
     */
    if (
      (
        previousY -
        lineY
      ) *
      (
        y -
        lineY
      ) <= 0 &&
      Math.sign(vy) ===
        direction
    ) {
      /*
       * Interpolate between the previous and current
       * position for a more accurate crossing point.
       */
      const denominator =
        y -
        previousY;

      const t =
        Math.abs(
          denominator,
        ) > 1e-9
          ? (
              lineY -
              previousY
            ) /
            denominator
          : 0;

      /*
       * Uses the stored start-of-step X rather than
       * reconstructing it from velocity, which would be
       * wrong on a step where the puck hit a side wall.
       */
      const interpolatedX =
        previousX +
        (
          x -
          previousX
        ) *
        t;

      return {
        x: Math.max(
          minX,
          Math.min(
            maxX,
            interpolatedX,
          ),
        ),

        time:
          elapsed -
          simulationStep +
          simulationStep *
            t,
      };
    }

    /*
     * Very slow puck: continuing the simulation
     * is no longer useful.
     */
    if (
      Math.abs(vx) +
        Math.abs(vy) <
      10
    ) {
      break;
    }
  }

  return {
    x: position.x,
    time: Infinity,
  };
}