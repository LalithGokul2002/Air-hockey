import { PADDLE, TABLE } from '../config';
import type { Paddle } from '../entities/Paddle';
import type { Puck } from '../entities/Puck';
import { lerp } from '../physics/math';
import { Vector2 } from '../physics/Vector2';
import type { AIProfile } from './difficulty';
import { predictCrossing } from './PuckPrediction';

/**
 *   DEFEND  – puck is in the player's half: position to cover the threat.
 *   TRACK   – puck is coming at us: move to where it will cross our defence line.
 *   ATTACK  – puck is on our side and in front of us: line up and strike toward the goal.
 *   RETURN  – puck got behind us: go around it to get goal-side again.
 *   CLEAR   – puck is stuck so close to our back wall that we can't get
 *             behind it: sweep it out from the side.
 */
export type AIState =
  | 'DEFEND'
  | 'TRACK'
  | 'ATTACK'
  | 'RETURN'
  | 'CLEAR';

const DEFENSE_Y =
  PADDLE.homeOffset;

const HALF_Y =
  TABLE.height / 2;

/** Puck speed toward our goal above which we block instead of attacking. */
const INCOMING_SPEED = 250;

/** How well lined up (cosine) the paddle must be before driving through the puck. */
const ALIGNMENT_TO_STRIKE = 0.8;

const STRIKE_FOLLOW_THROUGH = 30;

/**
 * Avoid treating extremely small prediction times as meaningful.
 * This prevents the AI from calculating an unrealistically tiny
 * reaction window.
 */
const MIN_INTERCEPT_TIME = 0.05;

/**
 * Keep the AI from hugging the extreme table edges
 * while defending.
 */
const DEFENSE_MARGIN = 55;

/**
 * How far in front of the defensive line the paddle
 * can position itself when anticipating an attack.
 */
const DEFENSE_FORWARD_OFFSET = 35;

/**
 * Minimum puck speed that is considered meaningful
 * when estimating a defensive trajectory.
 */
const MIN_THREAT_SPEED = 80;

const SHOT_MARGIN = 45;
const SHOT_TARGET_OFFSET = 90;

/*
 * CLEAR tuning (puck stuck near our back wall).
 */

/** How far above the puck's centre the paddle strikes from. */
const CLEAR_LANE_OFFSET = 8;

/** How close to the lane the paddle must be before striking. */
const CLEAR_LANE_TOLERANCE = 6;

/** Gap left beside the puck while lining up. */
const CLEAR_LINE_UP_GAP = 12;

/** How far to back off after contact, to build speed for the next strike. */
const CLEAR_BACK_OFF = 40;

/** Extra distance that still counts as touching the puck. */
const CLEAR_CONTACT_MARGIN = 2;

/** How far past first contact the strike aims (the paddle is still at full speed on impact). */
const CLEAR_STRIKE_DEPTH = 12;

/** Only strike a (nearly) resting puck; a moving one is left to drift out. */
const CLEAR_STRIKE_MAX_SPEED = 60;

export class AIController {
  state: AIState =
    'RETURN';

  /** Where the AI currently wants its paddle to be. */
  readonly target =
    new Vector2();

  /** Latest predicted crossing point, kept for the debug overlay. */
  readonly predicted =
    new Vector2();

  /**
   * Reusable temporary vectors.
   *
   * These avoid allocating Vector2 instances while the AI
   * evaluates attack decisions.
   */
  private readonly shotDirection =
    new Vector2();

  private readonly lineUpPosition =
    new Vector2();

  private readonly leftShotTarget =
    new Vector2();

  private readonly rightShotTarget =
    new Vector2();

  private readonly paddleToPuck =
    new Vector2();

  private readonly paddle: Paddle;
  private readonly profile: AIProfile;

  private decisionTimer = 0;
  private aimOffset = 0;

  constructor(
    paddle: Paddle,
    profile: AIProfile,
  ) {
    this.paddle =
      paddle;

    this.profile =
      profile;

    this.leftShotTarget.set(
      SHOT_MARGIN,
      TABLE.height,
    );

    this.rightShotTarget.set(
      TABLE.width -
        SHOT_MARGIN,
      TABLE.height,
    );

    this.reset();
  }

  reset(): void {
    this.state =
      'RETURN';

    this.decisionTimer =
      0;

    this.aimOffset =
      0;

    this.target.set(
      TABLE.width / 2,
      DEFENSE_Y,
    );

    this.predicted.set(
      TABLE.width / 2,
      DEFENSE_Y,
    );

    this.paddle.setTarget(
      this.target.x,
      this.target.y,
    );
  }

  update(
    dt: number,
    puck: Puck,
  ): void {
    if (dt <= 0) {
      return;
    }

    this.decisionTimer -=
      dt;

    if (
      this.decisionTimer <= 0
    ) {
      this.decisionTimer =
        this.profile.reactionTime;

      this.decide(
        puck,
      );
    }

    this.paddle.setTarget(
      this.target.x,
      this.target.y,
    );
  }

  private decide(
    puck: Puck,
  ): void {
    const p =
      puck.position;

    const v =
      puck.velocity;

    const me =
      this.paddle.position;

    const reach =
      this.paddle.radius +
      puck.radius;

    this.setState(
      this.chooseState(
        puck,
      ),
    );

    switch (
      this.state
    ) {
      case 'DEFEND': {
        this.calculateDefensivePosition(
          puck,
        );

        break;
      }

      case 'TRACK': {
        const prediction =
          predictCrossing(
            p,
            v,
            DEFENSE_Y,
            puck.radius,
          );

        this.predicted.set(
          prediction.x,
          DEFENSE_Y,
        );

        /**
         * Check whether the paddle can physically
         * reach the predicted interception point
         * before the puck reaches the defence line.
         */
        if (
          !this.canReachPrediction(
            prediction.x,
            prediction.time,
          )
        ) {
          /**
           * The interception point is unreachable.
           *
           * Instead of blindly chasing the prediction,
           * move toward a safer central defensive position.
           */
          const emergencyX =
            lerp(
              TABLE.width / 2,
              prediction.x,
              0.35,
            );

          this.target.set(
            this.clampDefenseX(
              emergencyX +
                this.aimOffset,
            ),
            DEFENSE_Y,
          );

          break;
        }

        const x =
          lerp(
            me.x,
            prediction.x,
            this.profile.predictionAccuracy,
          );

        this.target.set(
          this.clampDefenseX(
            x +
              this.aimOffset,
          ),
          DEFENSE_Y,
        );

        break;
      }

      case 'ATTACK': {
        /**
         * Select a tactical target for the shot.
         */
        const aim =
          this.getShotTarget(
            puck,
          );

        /*
         * Build the shot direction in-place.
         *
         * This replaces subtract().normalize()
         * and avoids temporary Vector2 allocations.
         */
        this.shotDirection.set(
          aim.x - p.x,
          aim.y - p.y,
        );

        const shotMagnitudeSq =
          this.shotDirection.x *
            this.shotDirection.x +
          this.shotDirection.y *
            this.shotDirection.y;

        if (
          shotMagnitudeSq <=
          1e-12
        ) {
          this.target.copy(
            p,
          );

          break;
        }

        const shotMagnitude =
          Math.sqrt(
            shotMagnitudeSq,
          );

        this.shotDirection.x /=
          shotMagnitude;

        this.shotDirection.y /=
          shotMagnitude;

        /*
         * Calculate the line-up position
         * directly without allocating vectors.
         */
        this.lineUpPosition.set(
          p.x -
            this.shotDirection.x *
              reach,

          p.y -
            this.shotDirection.y *
              reach,
        );

        /*
         * Vector from paddle to puck.
         */
        this.paddleToPuck.set(
          p.x -
            me.x,

          p.y -
            me.y,
        );

        const paddleToPuckSq =
          this.paddleToPuck.x *
            this.paddleToPuck.x +
          this.paddleToPuck.y *
            this.paddleToPuck.y;

        let alignment = 0;

        if (
          paddleToPuckSq >
          1e-12
        ) {
          const paddleToPuckMagnitude =
            Math.sqrt(
              paddleToPuckSq,
            );

          alignment =
            (
              this.paddleToPuck.x *
                this.shotDirection.x +
              this.paddleToPuck.y *
                this.shotDirection.y
            ) /
            paddleToPuckMagnitude;
        }

        if (
          alignment >
          ALIGNMENT_TO_STRIKE
        ) {
          this.target.set(
            p.x +
              this.shotDirection.x *
                STRIKE_FOLLOW_THROUGH,

            p.y +
              this.shotDirection.y *
                STRIKE_FOLLOW_THROUGH,
          );
        } else {
          this.target.copy(
            this.lineUpPosition,
          );
        }

        break;
      }

      case 'RETURN': {
        /**
         * Step around the puck on whichever
         * side we're already on, then get
         * goal-side again.
         */
        const side =
          me.x < p.x
            ? -1
            : 1;

        /*
         * Not capped at DEFENSE_Y: the paddle has to be
         * able to get above a puck that stopped deep in
         * our half, otherwise it hovers beside it forever.
         * setTarget() keeps the point inside our bounds.
         */
        this.target.set(
          p.x +
            side *
              (reach + 8),

          p.y -
            reach,
        );

        break;
      }

      case 'CLEAR': {
        /*
         * We can't get above the puck, so hit it from
         * the side, in a lane just above its centre.
         * That gives the hit a small downward push
         * (and a puck above the lane bounces off the
         * back wall and comes down).
         *
         * Pressing against a resting puck does
         * nothing, so alternate: line up, strike
         * through it, back off, repeat.
         */
        const side =
          me.x < p.x
            ? -1
            : 1;

        const laneY =
          Math.max(
            this.paddle.bounds.minY,
            p.y -
              CLEAR_LANE_OFFSET,
          );

        const dx =
          p.x - me.x;

        const dy =
          p.y - me.y;

        const touching =
          dx * dx +
            dy * dy <=
          (reach + CLEAR_CONTACT_MARGIN) *
            (reach + CLEAR_CONTACT_MARGIN);

        const inLane =
          Math.abs(
            me.y - laneY,
          ) <
          CLEAR_LANE_TOLERANCE;

        if (
          puck.speed >
          CLEAR_STRIKE_MAX_SPEED
        ) {
          /*
           * Already moving (usually drifting away
           * after a strike and back-wall bounce).
           * Hitting it again tends to pin it back
           * into the wall, so drop out of its way
           * and let it come out.
           */
          this.target.set(
            me.x,
            Math.max(
              me.y,
              p.y +
                reach +
                CLEAR_BACK_OFF,
            ),
          );
        } else if (touching) {
          this.target.set(
            p.x +
              side *
                (reach + CLEAR_BACK_OFF),
            laneY,
          );
        } else if (!inLane) {
          this.target.set(
            p.x +
              side *
                (reach + CLEAR_LINE_UP_GAP),
            laneY,
          );
        } else {
          /*
           * Aim just past the contact point, not through
           * the puck: it's usually against a wall, and a
           * paddle that keeps pushing pins it there.
           */
          this.target.set(
            p.x +
              side *
                (reach - CLEAR_STRIKE_DEPTH),
            laneY,
          );
        }

        break;
      }
    }
  }

  /**
   * Calculates a defensive position using the puck's
   * current trajectory rather than simply following
   * its current X coordinate.
   *
   * The AI stays mostly central when the puck isn't
   * dangerous and shifts toward the predicted threat
   * when the puck is moving toward its goal.
   */
  private calculateDefensivePosition(
    puck: Puck,
  ): void {
    const p =
      puck.position;

    const v =
      puck.velocity;

    let desiredX =
      TABLE.width / 2;

    /**
     * Calculate puck speed without allocating
     * another Vector2 on the physics hot path.
     */
    const speedSq =
      v.x * v.x +
      v.y * v.y;

    const speed =
      Math.sqrt(
        speedSq,
      );

    /**
     * Only react strongly to a puck that has
     * meaningful velocity toward the AI goal.
     */
    if (
      speed >
        MIN_THREAT_SPEED &&
      v.y <
        -MIN_THREAT_SPEED
    ) {
      const prediction =
        predictCrossing(
          p,
          v,
          DEFENSE_Y +
            DEFENSE_FORWARD_OFFSET,
          puck.radius,
        );

      if (
        Number.isFinite(
          prediction.time,
        )
      ) {
        this.predicted.set(
          prediction.x,
          DEFENSE_Y +
            DEFENSE_FORWARD_OFFSET,
        );

        /**
         * Don't immediately commit the full distance.
         *
         * PredictionAccuracy determines how strongly
         * this difficulty level trusts the prediction.
         */
        desiredX =
          lerp(
            TABLE.width / 2,
            prediction.x,
            this.profile.predictionAccuracy,
          );
      } else {
        /**
         * If prediction isn't available,
         * follow the puck conservatively.
         */
        desiredX =
          lerp(
            TABLE.width / 2,
            p.x,
            0.25,
          );
      }
    } else {
      /**
       * Puck isn't currently a strong threat.
       *
       * Maintain a central defensive posture while
       * still making small positional adjustments.
       */
      desiredX =
        lerp(
          TABLE.width / 2,
          p.x,
          0.2,
        );
    }

    this.target.set(
      this.clampDefenseX(
        desiredX +
          this.aimOffset,
      ),
      DEFENSE_Y,
    );
  }

  /**
   * Prevent defensive positioning from taking
   * the paddle too close to either side wall.
   */
  private clampDefenseX(
    x: number,
  ): number {
    return Math.max(
      DEFENSE_MARGIN,
      Math.min(
        TABLE.width -
          DEFENSE_MARGIN,
        x,
      ),
    );
  }

  /**
   * Select where the AI wants to send the puck.
   *
   * If the puck is on one side, attack the opposite
   * corner to create a cross-table shot.
   *
   * When the puck is central, the current aim offset
   * introduces variation between left and right.
   */
  private getShotTarget(
    puck: Puck,
  ): Vector2 {
    const p =
      puck.position;

    /*
     * Reuse preallocated shot target vectors.
     */
    if (
      p.x <
      TABLE.width / 2 -
        SHOT_TARGET_OFFSET
    ) {
      return this.rightShotTarget;
    }

    if (
      p.x >
      TABLE.width / 2 +
        SHOT_TARGET_OFFSET
    ) {
      return this.leftShotTarget;
    }

    if (
      this.aimOffset < 0
    ) {
      return this.leftShotTarget;
    }

    return this.rightShotTarget;
  }

  /**
   * Determines whether the paddle has enough time
   * to reach the predicted interception X position.
   *
   * The calculation uses the AI profile's maximum
   * paddle speed, so faster difficulty levels naturally
   * have a larger reachable interception range.
   */
  private canReachPrediction(
    predictionX: number,
    predictionTime: number,
  ): boolean {
    if (
      !Number.isFinite(
        predictionTime,
      )
    ) {
      return false;
    }

    const time =
      Math.max(
        predictionTime,
        MIN_INTERCEPT_TIME,
      );

    const distanceX =
      Math.abs(
        predictionX -
          this.paddle.position.x,
      );

    const maxReach =
      this.profile.maxSpeed *
      time;

    return (
      distanceX <=
      maxReach
    );
  }

  private chooseState(
    puck: Puck,
  ): AIState {
    const p =
      puck.position;

    const v =
      puck.velocity;

    /**
     * Puck is in the player's half.
     *
     * If it is travelling back toward us,
     * prepare to intercept it.
     */
    if (
      p.y >
      HALF_Y
    ) {
      return v.y < -30
        ? 'TRACK'
        : 'DEFEND';
    }

    /**
     * Puck is on our half and moving quickly
     * toward our goal.
     */
    if (
      v.y <
        -INCOMING_SPEED &&
      p.y >
        DEFENSE_Y +
          this.paddle.radius +
          puck.radius
    ) {
      return 'TRACK';
    }

    /**
     * Puck is close enough and in front of
     * the AI paddle to attempt an attack.
     */
    if (
      p.y >
      this.paddle.position.y - 4
    ) {
      return 'ATTACK';
    }

    /**
     * Puck is behind the paddle.
     *
     * If there's room above it, get goal-side again;
     * otherwise it's pinned near our back wall and
     * has to be swept out.
     */
    const reach =
      this.paddle.radius +
      puck.radius;

    if (
      p.y - reach <
      this.paddle.bounds.minY
    ) {
      return 'CLEAR';
    }

    return 'RETURN';
  }

  private setState(
    next: AIState,
  ): void {
    if (
      next === this.state
    ) {
      return;
    }

    this.state =
      next;

    /**
     * Re-roll the aiming error whenever
     * the AI changes state.
     */
    this.aimOffset =
      (
        Math.random() * 2 -
        1
      ) *
      this.profile.aimError;
  }
}