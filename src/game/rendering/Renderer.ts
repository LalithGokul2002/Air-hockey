import {
  GOAL_LEFT,
  GOAL_RIGHT,
  TABLE,
} from '../config';

import type { Paddle } from '../entities/Paddle';
import type { Puck } from '../entities/Puck';

import type { CollisionEvent } from '../physics/CollisionSystem';
import { Vector2 } from '../physics/Vector2';

export const COLORS = {
  background: '#05060f',
  surface: '#0a0e22',
  grid: 'rgba(80, 120, 255, 0.05)',
  markings: 'rgba(120, 160, 255, 0.28)',
  wall: '#7c8cff',
  player: '#22d3ee',
  ai: '#ff2e88',
  puck: '#fde047',
} as const;

/**
 * The slice of world space kept on screen:
 * the table plus both goal pockets.
 */
const VIEW = {
  minX: -16,
  minY: -TABLE.goalDepth - 12,
  width: TABLE.width + 32,
  height:
    TABLE.height +
    2 * (TABLE.goalDepth + 12),
} as const;

const TRAIL_LENGTH = 18;
const TRAIL_SPEED_REFERENCE = 1000;
const TRAIL_MAX_SPEED = 1600;

/**
 * A jump larger than this between frames is a reset,
 * not movement, so the trail is cleared.
 */
const TRAIL_BREAK_DISTANCE = 80;

/**
 * How long an impact remains visible.
 */
const IMPACT_LIFETIME = 0.18;

/**
 * Maximum number of impact effects kept alive
 * at the same time.
 */
const MAX_IMPACTS = 24;

/**
 * Maximum camera shake produced by a goal.
 *
 * Collision impacts do NOT shake the camera.
 * Shake is reserved for major game events.
 */
const GOAL_SHAKE = 7;

/** Exponential decay rate of the camera shake, per second. */
const SHAKE_DECAY = 10;

/** Frame gaps longer than this (e.g. a background tab) don't count toward effect timing. */
const MAX_EFFECT_FRAME_SECONDS = 0.1;

export interface RenderView {
  puck: Puck;
  player: Paddle;
  ai: Paddle;

  /**
   * Interpolation factor between the previous
   * and current physics tick.
   */
  alpha: number;

  /**
   * Collisions since the previous frame, from the physics layer.
   */
  impacts?: readonly CollisionEvent[];
}

interface ImpactBurst extends CollisionEvent {
  createdAt: number;
}

export class Renderer {
  private readonly canvas:
    HTMLCanvasElement;

  private readonly ctx:
    CanvasRenderingContext2D;

  private dpr = 1;

  private scale = 1;

  private offsetX = 0;

  private offsetY = 0;

  // ── Puck trail ──────────────────────────────────────────

  private readonly trail:
    Vector2[] =
      Array.from(
        {
          length: TRAIL_LENGTH,
        },
        () => new Vector2(),
      );

  private trailHead = 0;

  private trailCount = 0;

  private currentPuckSpeed = 0;

  // ── Impact effects ──────────────────────────────────────

  private readonly impactBursts:
    ImpactBurst[] = [];

  // ── Game-feel camera shake ──────────────────────────────

  private shake = 0;

  private lastFrameAt = 0;

  // ── Scratch vectors (avoid per-frame allocation) ────────

  private readonly puckDrawPosition =
    new Vector2();

  private readonly paddleDrawPosition =
    new Vector2();

  constructor(
    canvas: HTMLCanvasElement,
  ) {
    const ctx =
      canvas.getContext('2d');

    if (!ctx) {
      throw new Error(
        'Canvas 2D context is not available',
      );
    }

    this.canvas = canvas;
    this.ctx = ctx;

    this.resize();
  }

  /**
   * Trigger camera shake for a major game event.
   *
   * Currently intended for goals only.
   *
   * @param intensity 0..1
   */
  triggerGoalShake(
    intensity = 1,
  ): void {
    const clampedIntensity =
      Math.max(
        0,
        Math.min(
          1,
          intensity,
        ),
      );

    this.shake =
      Math.max(
        this.shake,
        clampedIntensity *
          GOAL_SHAKE,
      );
  }

  /**
   * Match the backing store to the element's CSS size
   * and fit the table inside it.
   */
  resize(): void {
    const cssWidth =
      Math.max(
        1,
        this.canvas.clientWidth,
      );

    const cssHeight =
      Math.max(
        1,
        this.canvas.clientHeight,
      );

    this.dpr =
      Math.min(
        window.devicePixelRatio || 1,
        2,
      );

    this.canvas.width =
      Math.round(
        cssWidth * this.dpr,
      );

    this.canvas.height =
      Math.round(
        cssHeight * this.dpr,
      );

    this.scale =
      Math.min(
        cssWidth / VIEW.width,
        cssHeight / VIEW.height,
      );

    this.offsetX =
      (
        cssWidth -
        VIEW.width * this.scale
      ) / 2;

    this.offsetY =
      (
        cssHeight -
        VIEW.height * this.scale
      ) / 2;
  }

  /**
   * Convert a pointer position in client pixels
   * to world coordinates, written into `out`.
   */
  toWorld(
    clientX: number,
    clientY: number,
    out: Vector2,
  ): Vector2 {
    const rect =
      this.canvas.getBoundingClientRect();

    return out.set(
      (
        clientX -
        rect.left -
        this.offsetX
      ) /
        this.scale +
        VIEW.minX,

      (
        clientY -
        rect.top -
        this.offsetY
      ) /
        this.scale +
        VIEW.minY,
    );
  }

  draw(
    view: RenderView,
  ): void {
    const { ctx } =
      this;

    const now =
      performance.now();

    const frameSeconds =
      this.lastFrameAt > 0
        ? Math.min(
            (now - this.lastFrameAt) / 1000,
            MAX_EFFECT_FRAME_SECONDS,
          )
        : 0;

    this.lastFrameAt =
      now;

    /*
     * Register new collision effects, then drop
     * expired ones.
     */
    this.addImpacts(
      view.impacts,
      now,
    );

    this.cleanupImpacts(
      now,
    );

    /*
     * Camera shake decays with real frame time, so it
     * lasts equally long at 60, 120 or 144 Hz.
     *
     * Only triggerGoalShake() can add shake.
     */
    this.shake *=
      Math.exp(
        -SHAKE_DECAY *
          frameSeconds,
      );

    ctx.setTransform(
  1,
  0,
  0,
  1,
  0,
  0,
);

    ctx.fillStyle =
      COLORS.background;

    ctx.fillRect(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );

    const k =
      this.dpr *
      this.scale;

    const shakeX =
      (
        Math.random() * 2 -
        1
      ) *
      this.shake;

    const shakeY =
      (
        Math.random() * 2 -
        1
      ) *
      this.shake;

    ctx.setTransform(
      k,
      0,
      0,
      k,
      this.dpr *
        (
          this.offsetX -
          VIEW.minX *
            this.scale +
          shakeX
        ),
      this.dpr *
        (
          this.offsetY -
          VIEW.minY *
            this.scale +
          shakeY
        ),
    );

    const puckPos =
      this.interpolate(
        view.puck.previousPosition,
        view.puck.position,
        view.alpha,
        this.puckDrawPosition,
      );

    this.currentPuckSpeed =
      Math.min(
        TRAIL_MAX_SPEED,
        view.puck.speed,
      );

    /*
     * Update trail from the interpolated puck position.
     */
    this.pushTrail(
      puckPos,
    );

    this.drawTable();

    /*
     * Trail sits behind everything.
     */
    this.drawTrail(
      view.puck.radius,
    );

    /*
     * Impact effects sit above the table/trail,
     * but below the paddles and puck.
     */
    this.drawImpacts(
      now,
    );

    this.drawPaddle(
      view.ai,
      COLORS.ai,
      view.alpha,
    );

    this.drawPaddle(
      view.player,
      COLORS.player,
      view.alpha,
    );

    this.drawPuck(
      puckPos,
      view.puck.radius,
    );
  }

  /** Lerp between two positions into a reusable vector. */
  private interpolate(
    from: Vector2,
    to: Vector2,
    alpha: number,
    out: Vector2,
  ): Vector2 {
    return out.set(
      from.x +
        (to.x - from.x) *
          alpha,

      from.y +
        (to.y - from.y) *
          alpha,
    );
  }

  // ── Table ───────────────────────────────────────────────

  private drawTable(): void {
    const { ctx } =
      this;

    const {
      width: W,
      height: H,
      goalWidth,
      goalDepth,
    } = TABLE;

    ctx.fillStyle =
      COLORS.surface;

    ctx.fillRect(
      0,
      0,
      W,
      H,
    );

    // Faint grid.
    ctx.strokeStyle =
      COLORS.grid;

    ctx.lineWidth = 1;

    ctx.beginPath();

    for (
      let x = 40;
      x < W;
      x += 40
    ) {
      ctx.moveTo(
        x,
        0,
      );

      ctx.lineTo(
        x,
        H,
      );
    }

    for (
      let y = 40;
      y < H;
      y += 40
    ) {
      ctx.moveTo(
        0,
        y,
      );

      ctx.lineTo(
        W,
        y,
      );
    }

    ctx.stroke();

    // Goal pockets.
    ctx.fillStyle =
      'rgba(255, 46, 136, 0.12)';

    ctx.fillRect(
      GOAL_LEFT,
      -goalDepth,
      goalWidth,
      goalDepth,
    );

    ctx.fillStyle =
      'rgba(34, 211, 238, 0.12)';

    ctx.fillRect(
      GOAL_LEFT,
      H,
      goalWidth,
      goalDepth,
    );

    // Centre line, centre circle and goal creases.
    ctx.strokeStyle =
      COLORS.markings;

    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.moveTo(
      0,
      H / 2,
    );

    ctx.lineTo(
      W,
      H / 2,
    );

    ctx.moveTo(
      W / 2 + 60,
      H / 2,
    );

    ctx.arc(
      W / 2,
      H / 2,
      60,
      0,
      Math.PI * 2,
    );

    ctx.moveTo(
      GOAL_RIGHT,
      0,
    );

    ctx.arc(
      W / 2,
      0,
      goalWidth / 2,
      0,
      Math.PI,
    );

    ctx.moveTo(
      GOAL_LEFT,
      H,
    );

    ctx.arc(
      W / 2,
      H,
      goalWidth / 2,
      Math.PI,
      Math.PI * 2,
    );

    ctx.stroke();

    ctx.fillStyle =
      COLORS.markings;

    ctx.beginPath();

    ctx.arc(
      W / 2,
      H / 2,
      5,
      0,
      Math.PI * 2,
    );

    ctx.fill();

    // Walls, leaving a gap at each goal mouth.
    ctx.save();

    ctx.lineCap =
      'round';

    ctx.lineJoin =
      'round';

    ctx.lineWidth = 4;

    ctx.shadowBlur = 16;

    ctx.strokeStyle =
      COLORS.wall;

    ctx.shadowColor =
      COLORS.wall;

    ctx.beginPath();

    ctx.moveTo(
      GOAL_LEFT,
      0,
    );

    ctx.lineTo(
      0,
      0,
    );

    ctx.lineTo(
      0,
      H,
    );

    ctx.lineTo(
      GOAL_LEFT,
      H,
    );

    ctx.moveTo(
      GOAL_RIGHT,
      H,
    );

    ctx.lineTo(
      W,
      H,
    );

    ctx.lineTo(
      W,
      0,
    );

    ctx.lineTo(
      GOAL_RIGHT,
      0,
    );

    ctx.stroke();

    this.strokeGoal(
      0,
      -goalDepth,
      COLORS.ai,
    );

    this.strokeGoal(
      H,
      H + goalDepth,
      COLORS.player,
    );

    ctx.restore();
  }

  private strokeGoal(
    lineY: number,
    backY: number,
    color: string,
  ): void {
    const { ctx } =
      this;

    ctx.strokeStyle =
      color;

    ctx.shadowColor =
      color;

    ctx.beginPath();

    ctx.moveTo(
      GOAL_LEFT,
      lineY,
    );

    ctx.lineTo(
      GOAL_LEFT,
      backY,
    );

    ctx.lineTo(
      GOAL_RIGHT,
      backY,
    );

    ctx.lineTo(
      GOAL_RIGHT,
      lineY,
    );

    ctx.stroke();
  }

  // ── Paddles ─────────────────────────────────────────────

  private drawPaddle(
    paddle: Paddle,
    color: string,
    alpha: number,
  ): void {
    const { ctx } =
      this;

    const pos =
      this.interpolate(
        paddle.previousPosition,
        paddle.position,
        alpha,
        this.paddleDrawPosition,
      );

    const r =
      paddle.radius;

    ctx.save();

    ctx.shadowBlur = 24;

    ctx.shadowColor =
      color;

    ctx.fillStyle =
      '#0b1026';

    ctx.beginPath();

    ctx.arc(
      pos.x,
      pos.y,
      r,
      0,
      Math.PI * 2,
    );

    ctx.fill();

    ctx.strokeStyle =
      color;

    ctx.lineWidth = 5;

    ctx.beginPath();

    ctx.arc(
      pos.x,
      pos.y,
      r - 2.5,
      0,
      Math.PI * 2,
    );

    ctx.stroke();

    ctx.lineWidth = 3;

    ctx.beginPath();

    ctx.arc(
      pos.x,
      pos.y,
      r * 0.42,
      0,
      Math.PI * 2,
    );

    ctx.stroke();

    ctx.restore();
  }

  // ── Puck ────────────────────────────────────────────────

  private drawPuck(
    pos: Vector2,
    r: number,
  ): void {
    const { ctx } =
      this;

    ctx.save();

    ctx.shadowBlur = 22;

    ctx.shadowColor =
      COLORS.puck;

    ctx.fillStyle =
      COLORS.puck;

    ctx.beginPath();

    ctx.arc(
      pos.x,
      pos.y,
      r,
      0,
      Math.PI * 2,
    );

    ctx.fill();

    ctx.restore();

    ctx.strokeStyle =
      'rgba(5, 6, 15, 0.45)';

    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.arc(
      pos.x,
      pos.y,
      r * 0.55,
      0,
      Math.PI * 2,
    );

    ctx.stroke();
  }

  // ── Trail ───────────────────────────────────────────────

  private pushTrail(
    pos: Vector2,
  ): void {
    if (
      this.trailCount > 0
    ) {
      const newest =
        this.trail[
          (
            this.trailHead +
            TRAIL_LENGTH -
            1
          ) %
            TRAIL_LENGTH
        ];

      if (
        newest.distanceTo(
          pos,
        ) >
        TRAIL_BREAK_DISTANCE
      ) {
        this.trailCount = 0;
      }
    }

    this.trail[
      this.trailHead
    ].copy(pos);

    this.trailHead =
      (
        this.trailHead + 1
      ) %
      TRAIL_LENGTH;

    this.trailCount =
      Math.min(
        this.trailCount + 1,
        TRAIL_LENGTH,
      );
  }

  private drawTrail(
    radius: number,
  ): void {
    const { ctx } =
      this;

    ctx.fillStyle =
      COLORS.puck;

    const speedFactor =
      Math.min(
        1,
        this.currentPuckSpeed /
          TRAIL_SPEED_REFERENCE,
      );

    /*
     * Oldest first so newer segments
     * draw over older segments.
     */
    for (
      let i = 0;
      i < this.trailCount;
      i++
    ) {
      const index =
        (
          this.trailHead -
          this.trailCount +
          i +
          TRAIL_LENGTH
        ) %
        TRAIL_LENGTH;

      const t =
        (
          i + 1
        ) /
        this.trailCount;

      const p =
        this.trail[index];

      /*
       * Faster puck = denser, brighter trail.
       * Slow movement keeps the trail subtle.
       */
      ctx.globalAlpha =
        t *
        (
          0.10 +
          0.20 * speedFactor
        );

      const trailRadius =
        radius *
        (
          0.32 +
          0.68 * t
        ) *
        (
          0.85 +
          0.15 * speedFactor
        );

      ctx.beginPath();

      ctx.arc(
        p.x,
        p.y,
        trailRadius,
        0,
        Math.PI * 2,
      );

      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  // ── Impact effects ──────────────────────────────────────

  /*
   * Camera shake is intentionally NOT triggered by
   * impacts: paddle, wall and post hits keep the view
   * stable. Goals use triggerGoalShake().
   */
  private addImpacts(
    impacts:
      readonly CollisionEvent[] |
      undefined,
    now: number,
  ): void {
    if (
      !impacts ||
      impacts.length === 0
    ) {
      return;
    }

    for (
      const impact of impacts
    ) {
      this.impactBursts.push({
        ...impact,
        createdAt: now,
      });
    }

    /*
     * Keep only the newest effects if many
     * collisions happen at once.
     */
    const overflow =
      this.impactBursts.length -
      MAX_IMPACTS;

    if (overflow > 0) {
      this.impactBursts.splice(
        0,
        overflow,
      );
    }
  }

  /** Drop expired effects in place (no new array per frame). */
  private cleanupImpacts(
    now: number,
  ): void {
    const bursts =
      this.impactBursts;

    let kept = 0;

    for (
      let i = 0;
      i < bursts.length;
      i++
    ) {
      if (
        (now - bursts[i].createdAt) / 1000 <
        IMPACT_LIFETIME
      ) {
        bursts[kept++] =
          bursts[i];
      }
    }

    bursts.length =
      kept;
  }

  private drawImpacts(
    now: number,
  ): void {
    if (
      this.impactBursts.length === 0
    ) {
      return;
    }

    const {
      ctx,
    } = this;

    for (
      const impact of
        this.impactBursts
    ) {
      const age =
        (
          now -
          impact.createdAt
        ) /
        1000;

      const progress =
        Math.min(
          1,
          age /
            IMPACT_LIFETIME,
        );

      /*
       * Ease-out expansion:
       * large at the start, then slows down.
       */
      const expansion =
        1 -
        Math.pow(
          1 - progress,
          3,
        );

      const strength =
        Math.min(
          impact.strength,
          1200,
        );

      /*
       * Convert physics impulse into
       * a sensible visual radius.
       */
      const baseRadius =
        impact.type ===
        'paddle'
          ? 20
          : impact.type ===
            'post'
          ? 12
          : 10;

      const radius =
        baseRadius +
        expansion *
          (
            14 +
            Math.min(
              24,
              strength * 0.025,
            )
          );

      const alpha =
        (
          1 - progress
        ) *
        (
          impact.type ===
          'paddle'
            ? 0.75
            : 0.5
        );

      const color =
        impact.type ===
        'paddle'
          ? impact.side ===
            'player'
            ? COLORS.player
            : COLORS.ai
          : impact.type ===
            'post'
          ? COLORS.puck
          : COLORS.wall;

      ctx.save();

      ctx.globalAlpha =
        alpha;

      ctx.strokeStyle =
        color;

      ctx.shadowColor =
        color;

      ctx.shadowBlur =
        impact.type ===
        'paddle'
          ? 18
          : 10;

      ctx.lineWidth =
        impact.type ===
        'paddle'
          ? 3
          : 2;

      ctx.beginPath();

      ctx.arc(
        impact.x,
        impact.y,
        radius,
        0,
        Math.PI * 2,
      );

      ctx.stroke();

      /*
       * Paddle hits get a small bright core.
       */
      if (
        impact.type ===
        'paddle'
      ) {
        ctx.globalAlpha =
          alpha * 0.65;

        ctx.fillStyle =
          color;

        ctx.beginPath();

        ctx.arc(
          impact.x,
          impact.y,
          Math.max(
            2,
            6 *
              (1 - progress),
          ),
          0,
          Math.PI * 2,
        );

        ctx.fill();
      }

      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }
}