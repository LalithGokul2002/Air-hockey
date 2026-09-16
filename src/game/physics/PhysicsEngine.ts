import type { Side } from '../../types/game';

import {
  PHYSICS,
  GOAL_LEFT,
  GOAL_RIGHT,
  TABLE,
} from '../config';

import type { Paddle } from '../entities/Paddle';
import type { Puck } from '../entities/Puck';

import {
  CollisionSystem,
  type CollisionEvent,
} from './CollisionSystem';

export interface PhysicsStepResult {
  /**
   * Collisions from this tick.
   *
   * The array is reused by the next step() call,
   * so callers must read it before stepping again.
   */
  readonly events: readonly CollisionEvent[];

  /** Side that scored during this tick, if any. */
  goal: Side | null;
}

export class PhysicsEngine {
  private readonly collisions =
    new CollisionSystem();

  /*
   * Reused every tick so the fixed-step hot path
   * doesn't allocate a result object or array.
   */
  private readonly events:
    CollisionEvent[] = [];

  private readonly result: {
    events: CollisionEvent[];
    goal: Side | null;
  } = {
    events: this.events,
    goal: null,
  };

  /**
   * Advance the simulation by one fixed tick,
   * split into sub-steps.
   *
   * Goal detection happens inside each sub-step,
   * straight after the puck moves, so a goal is
   * registered before anything can bounce the puck
   * back out.
   */
  step(
    puck: Puck,
    paddles: readonly Paddle[],
    dt: number,
    simulatePuck: boolean,
  ): PhysicsStepResult {
    const events =
      this.events;

    events.length = 0;

    this.result.goal = null;

    /*
     * Ignore invalid or zero-length physics steps.
     */
    if (dt <= 0) {
      return this.result;
    }

    const substeps = Math.max(
      1,
      Math.floor(PHYSICS.substeps),
    );

    const h =
      dt / substeps;

    for (
      let i = 0;
      i < substeps;
      i++
    ) {
      /*
       * Paddles move on every sub-step so paddle
       * collision detection stays stable.
       */
      for (const paddle of paddles) {
        paddle.update(h);
      }

      /*
       * During COUNTDOWN or GOAL the paddles keep
       * moving while the puck is held.
       */
      if (!simulatePuck) {
        continue;
      }

      puck.integrate(h);

      this.result.goal =
        this.checkGoal(puck);

      if (this.result.goal) {
        return this.result;
      }

      for (const paddle of paddles) {
        const hit =
          this.collisions.resolvePuckPaddle(
            puck,
            paddle,
          );

        if (hit) {
          events.push(hit);
        }
      }

      /*
       * A paddle can push the puck over the line
       * (an own goal), so check again.
       */
      this.result.goal =
        this.checkGoal(puck);

      if (this.result.goal) {
        return this.result;
      }

      this.collisions.resolvePuckTable(
        puck,
        events,
      );

      /*
       * If the table pushed the puck back into a
       * paddle, the paddle gives way.
       */
      for (const paddle of paddles) {
        this.collisions.separatePaddle(
          puck,
          paddle,
        );
      }
    }

    return this.result;
  }

  /**
   * A goal is scored when the puck's centre crosses
   * the goal line between the posts.
   *
   * Using the centre (not the leading edge) means a
   * puck that is about to clip a post is resolved by
   * the post collision instead of counting as a goal.
   *
   * Top goal    -> player scores.
   * Bottom goal -> AI scores.
   */
  private checkGoal(
    puck: Puck,
  ): Side | null {
    const {
      x,
      y,
    } = puck.position;

    if (
      x <= GOAL_LEFT ||
      x >= GOAL_RIGHT
    ) {
      return null;
    }

    if (y < 0) {
      return 'player';
    }

    if (y > TABLE.height) {
      return 'ai';
    }

    return null;
  }
}
