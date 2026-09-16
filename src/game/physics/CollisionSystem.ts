import type { Side } from '../../types/game';

import {
  GOAL_LEFT,
  GOAL_RIGHT,
  PHYSICS,
  TABLE,
} from '../config';

import type { Paddle } from '../entities/Paddle';
import type { Puck } from '../entities/Puck';

export interface CollisionEvent {
  type: 'paddle' | 'wall' | 'post';
  x: number;
  y: number;
  strength: number;
  side?: Side;
}

const MIN_EVENT_SPEED = 40;

/**
 * Small positional margin used after collision correction.
 *
 * This prevents the puck from being placed exactly on the
 * collision boundary and immediately colliding again on the
 * next physics substep.
 */
const COLLISION_SLOP = 0.01;

/**
 * How much sideways paddle movement is transferred
 * into the puck.
 */
const TANGENTIAL_TRANSFER = 0.2;

/**
 * Maximum speed the puck is allowed to have immediately
 * after a paddle collision.
 *
 * This is separate from the global maxPuckSpeed because
 * paddle hits should have their own gameplay-friendly limit.
 */
const MAX_PADDLE_HIT_SPEED = 900;

const POSTS = [
  { x: GOAL_LEFT, y: 0 },
  { x: GOAL_RIGHT, y: 0 },
  { x: GOAL_LEFT, y: TABLE.height },
  { x: GOAL_RIGHT, y: TABLE.height },
] as const;

export class CollisionSystem {
  /**
   * Circle vs circle against a kinematic paddle.
   *
   * The paddle influences the puck through:
   *
   * 1. Collision normal
   * 2. Relative velocity
   * 3. Restitution
   * 4. Controlled tangential paddle movement
   * 5. Paddle-hit speed limiting
   */
  resolvePuckPaddle(
    puck: Puck,
    paddle: Paddle,
  ): CollisionEvent | null {
    const dx =
      puck.position.x -
      paddle.position.x;

    const dy =
      puck.position.y -
      paddle.position.y;

    const minDistance =
      puck.radius +
      paddle.radius;

    const minDistanceSq =
      minDistance *
      minDistance;

    const distanceSq =
      dx * dx +
      dy * dy;

    /*
     * Fast rejection.
     *
     * Avoid sqrt unless the two circles actually
     * overlap.
     */
    if (
      distanceSq >=
      minDistanceSq
    ) {
      return null;
    }

    let distance: number;
    let nx: number;
    let ny: number;

    if (
      distanceSq >
      1e-12
    ) {
      distance =
        Math.sqrt(distanceSq);

      nx =
        dx / distance;

      ny =
        dy / distance;
    } else {
      /*
       * Perfectly stacked.
       *
       * Push the puck toward the opponent.
       */
      distance = 0;

      nx = 0;

      ny =
        paddle.side === 'player'
          ? -1
          : 1;
    }

    /**
     * Positional correction.
     *
     * The small collision slop prevents the puck from
     * sitting exactly on the paddle boundary and being
     * repeatedly detected as overlapping.
     */
    const penetration =
      minDistance -
      distance +
      COLLISION_SLOP;

    puck.position.x +=
      nx * penetration;

    puck.position.y +=
      ny * penetration;

    /**
     * Relative velocity between puck and paddle.
     */
    const relVx =
      puck.velocity.x -
      paddle.velocity.x;

    const relVy =
      puck.velocity.y -
      paddle.velocity.y;

    /**
     * Velocity along the collision normal.
     *
     * Negative = moving into the paddle.
     * Positive = already separating.
     */
    const normalSpeed =
      relVx * nx +
      relVy * ny;

    /**
     * If the puck is already separating from the paddle,
     * positional correction is enough. Do not apply another
     * bounce impulse.
     */
    if (
      normalSpeed >= 0
    ) {
      return null;
    }

    /**
     * Normal collision response.
     */
    const normalImpulse =
      -(
        1 +
        PHYSICS.paddleRestitution
      ) *
      normalSpeed;

    puck.velocity.x +=
      normalImpulse * nx;

    puck.velocity.y +=
      normalImpulse * ny;

    /**
     * Tangent direction along the paddle surface.
     */
    const tx = -ny;
    const ty = nx;

    /**
     * Paddle velocity along the tangent.
     */
    const tangentPaddleSpeed =
      paddle.velocity.x * tx +
      paddle.velocity.y * ty;

    /**
     * Transfer only a controlled amount of
     * lateral paddle movement.
     */
    const tangentialTransfer =
      tangentPaddleSpeed *
      TANGENTIAL_TRANSFER;

    puck.velocity.x +=
      tx * tangentialTransfer;

    puck.velocity.y +=
      ty * tangentialTransfer;

    /**
     * Paddle-hit speed cap.
     *
     * This prevents a fast paddle movement combined
     * with restitution from launching the puck too hard.
     */
    puck.velocity.clampMagnitudeInPlace(
      MAX_PADDLE_HIT_SPEED,
    );

    /**
     * The global safety limit remains the final
     * authority in case the configured values change.
     */
    puck.velocity.clampMagnitudeInPlace(
      PHYSICS.maxPuckSpeed,
    );

    return {
      type: 'paddle',

      x:
        paddle.position.x +
        nx * paddle.radius,

      y:
        paddle.position.y +
        ny * paddle.radius,

      strength:
        normalImpulse,

      side:
        paddle.side,
    };
  }

  /**
   * Keep the puck on the table:
   *
   * - side walls
   * - end walls (with a gap at each goal mouth)
   * - goal posts
   *
   * There are no goal-pocket walls: PhysicsEngine
   * registers the goal as soon as the puck's centre
   * crosses the line, before this ever runs.
   */
  resolvePuckTable(
    puck: Puck,
    events: CollisionEvent[],
  ): void {
    const {
      width,
      height,
    } = TABLE;

    const r =
      puck.radius;

    const e =
      PHYSICS.wallRestitution;

    const p =
      puck.position;

    const v =
      puck.velocity;

    /**
     * Left wall.
     */
    if (
      p.x < r &&
      v.x <= 0
    ) {
      p.x = r;

      this.pushWallEvent(
        events,
        0,
        p.y,
        v.x,
      );

      v.x =
        -v.x * e;
    }

    /**
     * Right wall.
     */
    else if (
      p.x >
        width - r &&
      v.x >= 0
    ) {
      p.x =
        width - r;

      this.pushWallEvent(
        events,
        width,
        p.y,
        v.x,
      );

      v.x =
        -v.x * e;
    }

    /**
     * Determine whether the puck is inside
     * the goal mouth.
     */
    const inGoalMouth =
      p.x >
        GOAL_LEFT &&
      p.x <
        GOAL_RIGHT;

    /**
     * Top and bottom walls outside the goal mouth.
     */
    if (!inGoalMouth) {
      /**
       * Top wall.
       */
      if (
        p.y < r &&
        v.y <= 0
      ) {
        p.y = r;

        this.pushWallEvent(
          events,
          p.x,
          0,
          v.y,
        );

        v.y =
          -v.y * e;
      }

      /**
       * Bottom wall.
       */
      else if (
        p.y >
          height - r &&
        v.y >= 0
      ) {
        p.y =
          height - r;

        this.pushWallEvent(
          events,
          p.x,
          height,
          v.y,
        );

        v.y =
          -v.y * e;
      }
    }

    /**
     * Goal posts.
     */
    for (
      const post of POSTS
    ) {
      this.resolvePuckPoint(
        puck,
        post.x,
        post.y,
        events,
      );
    }
  }

  /**
   * If the puck is pinned between a paddle and a wall,
   * push the paddle away so the puck doesn't become trapped.
   */
  separatePaddle(
    puck: Puck,
    paddle: Paddle,
  ): void {
    const dx =
      paddle.position.x -
      puck.position.x;

    const dy =
      paddle.position.y -
      puck.position.y;

    const minDistance =
      puck.radius +
      paddle.radius;

    const minDistanceSq =
      minDistance *
      minDistance;

    const distanceSq =
      dx * dx +
      dy * dy;

    if (
      distanceSq >=
      minDistanceSq
    ) {
      return;
    }

    /*
     * If the centres are almost identical,
     * there is no stable direction in which to
     * separate the paddle.
     */
    if (
      distanceSq <
      1e-12
    ) {
      return;
    }

    const distance =
      Math.sqrt(distanceSq);

    const penetration =
      minDistance -
      distance +
      COLLISION_SLOP;

    paddle.nudge(
      (dx / distance) *
        penetration,

      (dy / distance) *
        penetration,
    );
  }

  /**
   * Circle vs point.
   *
   * Used for the four goal posts.
   */
  private resolvePuckPoint(
    puck: Puck,
    px: number,
    py: number,
    events: CollisionEvent[],
  ): void {
    const dx =
      puck.position.x -
      px;

    const dy =
      puck.position.y -
      py;

    const distanceSq =
      dx * dx +
      dy * dy;

    const r =
      puck.radius;

    const radiusSq =
      r * r;

    /*
     * No collision.
     */
    if (
      distanceSq >=
      radiusSq
    ) {
      return;
    }

    let nx: number;
    let ny: number;

    if (
      distanceSq >=
      1e-12
    ) {
      const distance =
        Math.sqrt(distanceSq);

      nx =
        dx / distance;

      ny =
        dy / distance;
    } else {
      /*
       * Centre exactly on the post: push back
       * against the direction of travel.
       */
      const speed =
        puck.velocity.magnitude();

      if (
        speed <
        1e-6
      ) {
        return;
      }

      nx =
        -puck.velocity.x /
        speed;

      ny =
        -puck.velocity.y /
        speed;
    }

    /**
     * Correct penetration with a tiny separation margin.
     */
    puck.position.x =
      px +
      nx *
        (
          r +
          COLLISION_SLOP
        );

    puck.position.y =
      py +
      ny *
        (
          r +
          COLLISION_SLOP
        );

    /**
     * Velocity along collision normal.
     */
    const normalSpeed =
      puck.velocity.x * nx +
      puck.velocity.y * ny;

    if (
      normalSpeed >= 0
    ) {
      return;
    }

    const impulse =
      -(
        1 +
        PHYSICS.wallRestitution
      ) *
      normalSpeed;

    puck.velocity.x +=
      impulse * nx;

    puck.velocity.y +=
      impulse * ny;

    if (
      -normalSpeed >
      MIN_EVENT_SPEED
    ) {
      events.push({
        type: 'post',
        x: px,
        y: py,
        strength: impulse,
      });
    }
  }

  /**
   * Create a wall collision event only when
   * the incoming velocity is large enough to
   * produce a meaningful impact.
   */
  private pushWallEvent(
    events: CollisionEvent[],
    x: number,
    y: number,
    incomingSpeed: number,
  ): void {
    const speed =
      Math.abs(
        incomingSpeed,
      );

    if (
      speed >
      MIN_EVENT_SPEED
    ) {
      events.push({
        type: 'wall',
        x,
        y,
        strength: speed,
      });
    }
  }
}