import {
  GOAL_LEFT,
  GOAL_RIGHT,
  PADDLE,
  PUCK,
  TABLE,
} from '../config';

import type { Paddle } from '../entities/Paddle';
import type { Puck } from '../entities/Puck';

import type { CollisionEvent } from '../physics/CollisionSystem';
import { Vector2 } from '../physics/Vector2';

export const COLORS = {
  surface: '#0a0d16',
  dots: 'rgba(150, 170, 220, 0.13)',
  markings: 'rgba(190, 210, 255, 0.32)',
  centreLine: 'rgba(90, 225, 255, 0.85)',
  wall: '#7c8cff',
  player: '#22d3ee',
  ai: '#ff2d4b',
  puck: '#ffd23f',
} as const;

/** Radius of the puck's dark face inside its glowing rim. */
const PUCK_FACE_RADIUS = PUCK.radius - 5;

/** Thickness of the metal frame around the playing surface, in world units. */
const FRAME = 22;

/**
 * The slice of world space kept on screen:
 * the table, its frame, and both goal nets.
 */
const VIEW = {
  minX: -FRAME - 4,
  minY: -TABLE.goalDepth - 4,
  width: TABLE.width + 2 * (FRAME + 4),
  height:
    TABLE.height +
    2 * (TABLE.goalDepth + 4),
} as const;

const VIEW_MAX_X =
  VIEW.minX +
  VIEW.width;

/**
 * Portrait: the table's long side runs up the screen (desktop).
 * Landscape: it runs across the screen (phones and tablets).
 */
export type TableOrientation =
  | 'portrait'
  | 'landscape';

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

  // ── Cached artwork ──────────────────────────────────────

  /**
   * The table never changes during play, so it is painted
   * once per resize into this off-screen canvas and copied
   * to the screen each frame with a single drawImage().
   */
  private readonly tableLayer =
    document.createElement('canvas');

  /**
   * Gradients for the paddles and puck, built once around
   * the origin; drawing translates to the object instead of
   * creating new gradients every frame.
   */
  private readonly paddleStyles: Record<
    'player' | 'ai',
    {
      color: string;
      bowl: CanvasGradient;
      knob: CanvasGradient;
    }
  >;

  private readonly puckFace: CanvasGradient;

  private readonly orientation:
    TableOrientation;

  constructor(
    canvas: HTMLCanvasElement,
    orientation: TableOrientation = 'portrait',
  ) {
    this.orientation =
      orientation;

    const ctx =
      canvas.getContext('2d');

    if (!ctx) {
      throw new Error(
        'Canvas 2D context is not available',
      );
    }

    this.canvas = canvas;
    this.ctx = ctx;

    this.paddleStyles = {
      player: this.createPaddleStyle(
        COLORS.player,
        '#8ff3ff',
      ),
      ai: this.createPaddleStyle(
        COLORS.ai,
        '#ff9aa6',
      ),
    };

    this.puckFace =
      ctx.createRadialGradient(
        -3,
        -4,
        1,
        0,
        0,
        PUCK_FACE_RADIUS,
      );

    this.puckFace.addColorStop(0, '#4a4128');
    this.puckFace.addColorStop(1, '#0d0c08');

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

    /*
     * In landscape the world is drawn rotated 90°, so its
     * width and height swap places on screen.
     */
    const landscape =
      this.orientation === 'landscape';

    const viewScreenWidth =
      landscape ? VIEW.height : VIEW.width;

    const viewScreenHeight =
      landscape ? VIEW.width : VIEW.height;

    this.scale =
      Math.min(
        cssWidth / viewScreenWidth,
        cssHeight / viewScreenHeight,
      );

    this.offsetX =
      (
        cssWidth -
        viewScreenWidth * this.scale
      ) / 2;

    this.offsetY =
      (
        cssHeight -
        viewScreenHeight * this.scale
      ) / 2;

    this.paintTableLayer();
  }

  /** Re-render the static table into the off-screen layer at the current size. */
  private paintTableLayer(): void {
    const layer =
      this.tableLayer;

    layer.width =
      this.canvas.width;

    layer.height =
      this.canvas.height;

    const layerCtx =
      layer.getContext('2d');

    if (!layerCtx) {
      return;
    }

    this.applyWorldTransform(
      layerCtx,
      0,
      0,
    );

    paintTable(
      layerCtx,
    );
  }

  /**
   * World → device-pixel transform, optionally offset (in CSS px) for shake.
   *
   * Portrait:  screen = (x, y), the AI at the top.
   * Landscape: the world turns 90° anticlockwise, so its y axis runs
   *            left → right (AI on the left, player on the right) and
   *            its x axis runs bottom → top:
   *              screenX = offsetX + (y - minY) · scale
   *              screenY = offsetY + (maxX - x) · scale
   *
   * The physics never knows the difference; only drawing and
   * toWorld() apply the rotation.
   */
  private applyWorldTransform(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
  ): void {
    const k =
      this.dpr *
      this.scale;

    if (
      this.orientation === 'landscape'
    ) {
      ctx.setTransform(
        0,
        -k,
        k,
        0,
        this.dpr *
          (
            this.offsetX -
            VIEW.minY *
              this.scale +
            offsetX
          ),
        this.dpr *
          (
            this.offsetY +
            VIEW_MAX_X *
              this.scale +
            offsetY
          ),
      );

      return;
    }

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
          offsetX
        ),
      this.dpr *
        (
          this.offsetY -
          VIEW.minY *
            this.scale +
          offsetY
        ),
    );
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

    if (
      this.orientation === 'landscape'
    ) {
      // Inverse of the landscape mapping in applyWorldTransform().
      const screenX =
        clientX -
        rect.left -
        this.offsetX;

      const screenY =
        clientY -
        rect.top -
        this.offsetY;

      return out.set(
        VIEW_MAX_X -
          screenY /
            this.scale,

        screenX /
          this.scale +
          VIEW.minY,
      );
    }

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

    /*
     * Clear to transparent: the page's own background
     * shows around the table.
     */
    ctx.setTransform(
      1,
      0,
      0,
      1,
      0,
      0,
    );

    ctx.clearRect(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );

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

    /*
     * The pre-painted table, shifted by the shake.
     */
    ctx.drawImage(
      this.tableLayer,
      this.dpr * shakeX,
      this.dpr * shakeY,
    );

    this.applyWorldTransform(
      ctx,
      shakeX,
      shakeY,
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
      view.alpha,
    );

    this.drawPaddle(
      view.player,
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

  // ── Paddles ─────────────────────────────────────────────

  private createPaddleStyle(
    color: string,
    light: string,
  ): {
    color: string;
    bowl: CanvasGradient;
    knob: CanvasGradient;
  } {
    const r =
      PADDLE.radius;

    const bowl =
      this.ctx.createRadialGradient(
        -r * 0.2,
        -r * 0.22,
        2,
        0,
        0,
        r * 0.8,
      );

    bowl.addColorStop(0, '#1d2434');
    bowl.addColorStop(1, '#06080e');

    const knob =
      this.ctx.createRadialGradient(
        -r * 0.14,
        -r * 0.16,
        1,
        0,
        0,
        r * 0.42,
      );

    knob.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    knob.addColorStop(0.14, light);
    knob.addColorStop(0.5, '#141a28');
    knob.addColorStop(1, '#05070c');

    return {
      color,
      bowl,
      knob,
    };
  }

  /**
   * Neon mallet seen from above: glowing rim, dark bowl,
   * glossy knob. Drawn around the origin after translating.
   */
  private drawPaddle(
    paddle: Paddle,
    alpha: number,
  ): void {
    const { ctx } =
      this;

    const style =
      this.paddleStyles[
        paddle.side
      ];

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

    ctx.translate(
      pos.x,
      pos.y,
    );

    // Contact shadow.
    ctx.fillStyle =
      'rgba(0, 0, 0, 0.45)';

    fillCircle(ctx, 3, 5, r);

    // Neon rim.
    ctx.shadowBlur = 26;
    ctx.shadowColor = style.color;
    ctx.fillStyle = style.color;

    fillCircle(ctx, 0, 0, r);

    ctx.shadowBlur = 0;

    // Bowl.
    ctx.fillStyle =
      style.bowl;

    fillCircle(ctx, 0, 0, r * 0.78);

    ctx.strokeStyle =
      'rgba(255, 255, 255, 0.35)';

    ctx.lineWidth = 1.5;

    strokeCircle(ctx, 0, 0, r * 0.93);

    // Knob.
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.fillStyle = style.knob;

    fillCircle(ctx, 0, 0, r * 0.42);

    ctx.restore();
  }

  // ── Puck ────────────────────────────────────────────────

  /** Dark disc with a glowing yellow rim. */
  private drawPuck(
    pos: Vector2,
    r: number,
  ): void {
    const { ctx } =
      this;

    ctx.save();

    ctx.translate(
      pos.x,
      pos.y,
    );

    ctx.fillStyle =
      'rgba(0, 0, 0, 0.5)';

    fillCircle(ctx, 2, 3, r);

    ctx.shadowBlur = 22;
    ctx.shadowColor = COLORS.puck;
    ctx.strokeStyle = COLORS.puck;
    ctx.lineWidth = 5;

    strokeCircle(ctx, 0, 0, r - 2.5);

    ctx.shadowBlur = 0;

    ctx.fillStyle =
      this.puckFace;

    fillCircle(ctx, 0, 0, PUCK_FACE_RADIUS);

    ctx.strokeStyle =
      'rgba(255, 210, 63, 0.35)';

    ctx.lineWidth = 1.2;

    strokeCircle(ctx, 0, 0, r * 0.5);

    ctx.restore();
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

// ── Static table artwork ─────────────────────────────────
//
// Painted once per resize into the renderer's off-screen
// layer, never per frame, so it can afford gradients,
// glows and a few thousand air-hole dots.

/** Radius of the crease arc in front of each goal. */
const CREASE_RADIUS = 122;

/** Radius of the centre circle. */
const CENTRE_CIRCLE_RADIUS = 70;

/** Where the neon strips run along the frame, measured from each end. */
const RAIL_NEON_START = 30;
const RAIL_NEON_END = 190;

function paintTable(
  ctx: CanvasRenderingContext2D,
): void {
  paintFrame(ctx);
  paintSurface(ctx);
  paintMarkings(ctx);
  paintGoal(ctx, 'ai');
  paintGoal(ctx, 'player');
  paintRailNeon(ctx);
  paintBolts(ctx);
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
): void {
  const {
    width: W,
    height: H,
  } = TABLE;

  ctx.save();

  const metal =
    ctx.createLinearGradient(
      -FRAME,
      0,
      W + FRAME,
      0,
    );

  metal.addColorStop(0, '#2c3342');
  metal.addColorStop(0.07, '#10131b');
  metal.addColorStop(0.5, '#1a1f2a');
  metal.addColorStop(0.93, '#10131b');
  metal.addColorStop(1, '#2c3342');

  ctx.beginPath();
  ctx.roundRect(-FRAME, -FRAME, W + 2 * FRAME, H + 2 * FRAME, 30);
  ctx.fillStyle = metal;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 30;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner lip where the frame meets the surface.
  ctx.beginPath();
  ctx.roundRect(-6, -6, W + 12, H + 12, 20);
  ctx.strokeStyle = 'rgba(200, 215, 240, 0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function paintSurface(
  ctx: CanvasRenderingContext2D,
): void {
  const {
    width: W,
    height: H,
  } = TABLE;

  ctx.save();

  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 16);
  ctx.clip();

  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(0, 0, W, H);

  // Light spilling from the neon: pink at the AI end, cyan at the player's.
  paintGlow(ctx, 0, 0, 260, 'rgba(255, 45, 75, 0.24)');
  paintGlow(ctx, W, 0, 260, 'rgba(255, 45, 75, 0.24)');
  paintGlow(ctx, W / 2, 0, 200, 'rgba(255, 45, 75, 0.1)');
  paintGlow(ctx, 0, H, 260, 'rgba(34, 211, 238, 0.24)');
  paintGlow(ctx, W, H, 260, 'rgba(34, 211, 238, 0.24)');
  paintGlow(ctx, W / 2, H, 200, 'rgba(34, 211, 238, 0.1)');

  // Soft reflections of overhead lights across the polished surface.
  const streaks =
    ctx.createLinearGradient(0, 0, 0, H);

  const clear = 'rgba(0, 0, 0, 0)';

  streaks.addColorStop(0, clear);
  streaks.addColorStop(0.15, clear);
  streaks.addColorStop(0.19, 'rgba(255, 120, 135, 0.08)');
  streaks.addColorStop(0.25, clear);
  streaks.addColorStop(0.37, clear);
  streaks.addColorStop(0.42, 'rgba(175, 205, 255, 0.07)');
  streaks.addColorStop(0.47, clear);
  streaks.addColorStop(0.55, clear);
  streaks.addColorStop(0.59, 'rgba(175, 205, 255, 0.06)');
  streaks.addColorStop(0.64, clear);
  streaks.addColorStop(0.76, clear);
  streaks.addColorStop(0.81, 'rgba(90, 205, 255, 0.08)');
  streaks.addColorStop(0.86, clear);
  streaks.addColorStop(1, clear);

  ctx.fillStyle = streaks;
  ctx.fillRect(0, 0, W, H);

  // Air holes.
  ctx.fillStyle = COLORS.dots;

  for (let x = 12; x < W; x += 16) {
    for (let y = 12; y < H; y += 16) {
      ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
    }
  }

  ctx.restore();
}

function paintMarkings(
  ctx: CanvasRenderingContext2D,
): void {
  const {
    width: W,
    height: H,
  } = TABLE;

  ctx.save();

  // Faint line down the long axis.
  ctx.strokeStyle = 'rgba(160, 185, 235, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();

  // Centre circle.
  paintGlow(ctx, W / 2, H / 2, CENTRE_CIRCLE_RADIUS, 'rgba(120, 150, 255, 0.1)');

  ctx.strokeStyle = COLORS.markings;
  ctx.lineWidth = 1.5;
  strokeCircle(ctx, W / 2, H / 2, CENTRE_CIRCLE_RADIUS);

  ctx.strokeStyle = 'rgba(190, 210, 255, 0.12)';
  ctx.lineWidth = 1;
  strokeCircle(ctx, W / 2, H / 2, CENTRE_CIRCLE_RADIUS - 8);

  // Creases, in each side's colour.
  paintCrease(ctx, 0, 0, Math.PI, COLORS.ai);
  paintCrease(ctx, H, Math.PI, Math.PI * 2, COLORS.player);

  // Glowing dashed centre line.
  ctx.setLineDash([12, 9]);
  ctx.strokeStyle = COLORS.centreLine;
  ctx.lineWidth = 2;
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();

  ctx.restore();
}

function paintCrease(
  ctx: CanvasRenderingContext2D,
  lineY: number,
  startAngle: number,
  endAngle: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(TABLE.width / 2, lineY, CREASE_RADIUS, startAngle, endAngle);
  ctx.stroke();
  ctx.restore();
}

/** A netted goal pocket behind the goal line, cutting through the frame. */
function paintGoal(
  ctx: CanvasRenderingContext2D,
  side: 'player' | 'ai',
): void {
  const {
    height: H,
    goalWidth,
    goalDepth,
  } = TABLE;

  const atTop =
    side === 'ai';

  const color =
    atTop ? COLORS.ai : COLORS.player;

  const mouthY =
    atTop ? 0 : H;

  const backY =
    atTop ? -goalDepth : H + goalDepth;

  const top =
    Math.min(mouthY, backY);

  ctx.save();

  ctx.beginPath();
  ctx.rect(GOAL_LEFT, top, goalWidth, goalDepth);
  ctx.fillStyle = '#04060b';
  ctx.fill();
  ctx.clip();

  // Net mesh.
  ctx.strokeStyle = 'rgba(200, 210, 235, 0.2)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();

  for (let d = -goalDepth; d < goalWidth + goalDepth; d += 7) {
    ctx.moveTo(GOAL_LEFT + d, top);
    ctx.lineTo(GOAL_LEFT + d + goalDepth, top + goalDepth);
    ctx.moveTo(GOAL_LEFT + d + goalDepth, top);
    ctx.lineTo(GOAL_LEFT + d, top + goalDepth);
  }

  ctx.stroke();

  // Neon light falling into the net from the mouth.
  const light =
    ctx.createLinearGradient(0, mouthY, 0, backY);

  light.addColorStop(0, atTop ? 'rgba(255, 45, 75, 0.35)' : 'rgba(34, 211, 238, 0.35)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = light;
  ctx.fillRect(GOAL_LEFT, top, goalWidth, goalDepth);

  ctx.restore();

  // Glowing goal frame.
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(GOAL_LEFT, mouthY);
  ctx.lineTo(GOAL_LEFT, backY);
  ctx.lineTo(GOAL_RIGHT, backY);
  ctx.lineTo(GOAL_RIGHT, mouthY);
  ctx.stroke();
  ctx.restore();
}

/** Neon strips on the frame: pink around the AI end, cyan around the player's. */
function paintRailNeon(
  ctx: CanvasRenderingContext2D,
): void {
  const {
    width: W,
    height: H,
  } = TABLE;

  const left = -FRAME / 2;
  const right = W + FRAME / 2;
  const top = -FRAME / 2;
  const bottom = H + FRAME / 2;
  const goalGap = 26;

  for (const [color, sign, end] of [
    [COLORS.ai, 1, 0],
    [COLORS.player, -1, H],
  ] as const) {
    const y1 = end + sign * RAIL_NEON_START;
    const y2 = end + sign * RAIL_NEON_END;
    const endY = end === 0 ? top : bottom;

    paintNeonLine(ctx, left, y1, left, y2, color);
    paintNeonLine(ctx, right, y1, right, y2, color);
    paintNeonLine(ctx, RAIL_NEON_START + 6, endY, GOAL_LEFT - goalGap, endY, color);
    paintNeonLine(ctx, GOAL_RIGHT + goalGap, endY, W - RAIL_NEON_START - 6, endY, color);
  }
}

function paintBolts(
  ctx: CanvasRenderingContext2D,
): void {
  const {
    width: W,
    height: H,
  } = TABLE;

  const edge = -FRAME / 2;

  const bolts: readonly [number, number][] = [
    // On the frame.
    [edge, H / 2],
    [W - edge, H / 2],
    [edge, H * 0.36],
    [W - edge, H * 0.36],
    [edge, H * 0.64],
    [W - edge, H * 0.64],
    // Surface corners.
    [14, 14],
    [W - 14, 14],
    [14, H - 14],
    [W - 14, H - 14],
  ];

  ctx.save();

  for (const [x, y] of bolts) {
    ctx.fillStyle = '#2a3140';
    fillCircle(ctx, x, y, 3.2);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    strokeCircle(ctx, x, y, 3.2);

    ctx.fillStyle = '#0a0d14';
    fillCircle(ctx, x, y, 1.1);
  }

  ctx.restore();
}

function paintNeonLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): void {
  ctx.save();
  ctx.lineCap = 'round';

  // Coloured glow...
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // ...around a white-hot core.
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function paintGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  const glow =
    ctx.createRadialGradient(x, y, 0, x, y, radius);

  glow.addColorStop(0, color);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function fillCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function strokeCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}
