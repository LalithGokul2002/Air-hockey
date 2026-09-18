import type {
  Difficulty,
  GameSnapshot,
  GameState,
  MatchStats,
  Score,
  Side,
} from '../types/game';

import { AIController } from './ai/AIController';
import { AI_PROFILES } from './ai/difficulty';

import { AudioManager } from './audio/AudioManager';

import {
  PADDLE,
  PHYSICS,
  RULES,
  TABLE,
} from './config';

import {
  Paddle,
  type Bounds,
} from './entities/Paddle';

import { Puck } from './entities/Puck';
import { GameLoop } from './GameLoop';
import { InputManager } from './InputManager';

import type {
  CollisionEvent,
} from './physics/CollisionSystem';

import { PhysicsEngine } from './physics/PhysicsEngine';
import { Renderer, type TableOrientation } from './rendering/Renderer';

type Listener =
  (snapshot: GameSnapshot) => void;

const {
  width: W,
  height: H,
} = TABLE;

const R =
  PADDLE.radius;

const PLAYER_BOUNDS: Bounds = {
  minX: R,
  maxX: W - R,
  minY: H / 2 + R,
  maxY: H - R,
};

const AI_BOUNDS: Bounds = {
  minX: R,
  maxX: W - R,
  minY: R,
  maxY: H / 2 - R,
};

/** Distance from the centre line to where the puck is placed for a serve. */
const SERVE_OFFSET = 110;

/**
 * How far the served puck glides toward the receiver before friction stops it.
 *
 * It must stop well short of the receiver's goal line
 * (H/2 - SERVE_OFFSET = 290 px away), so an idle
 * receiver can't concede straight from the serve.
 */
const SERVE_GLIDE_DISTANCE = 200;

/**
 * With exponential damping, v(t) = v0 · d^t, the puck travels v0 / -ln(d) in total,
 * so the launch speed that glides exactly SERVE_GLIDE_DISTANCE is:
 */
const SERVE_SPEED =
  SERVE_GLIDE_DISTANCE *
  -Math.log(PHYSICS.puckDamping);

const SERVE_HORIZONTAL_RATIO = 0.35;

const emptyStats = (): MatchStats => ({
  playerHits: 0,
  aiHits: 0,
  maxPuckSpeed: 0,
});

/**
 * Owns the simulation and exposes a small imperative API
 * plus a subscribable snapshot for React.
 *
 * Nothing in here knows about React.
 */
export class GameEngine {
  private readonly loop: GameLoop;

  private readonly renderer: Renderer;

  private readonly input: InputManager;

  private readonly resizeObserver: ResizeObserver;

  private readonly physics =
    new PhysicsEngine();

  private readonly puck =
    new Puck();

  private readonly player: Paddle;

  private readonly ai: Paddle;

  private readonly paddles:
    readonly Paddle[];

  private readonly aiController:
    AIController;

  private state: GameState =
    'MENU';

  private stateBeforePause:
    GameState = 'PLAYING';

  private stateTimer = 0;

  private elapsed = 0;

  private score: Score = {
    player: 0,
    ai: 0,
  };

  private readonly audio = new AudioManager();

  private lastScorer:
    Side | null = null;

  private stats =
    emptyStats();

  private lastHitAt:
    Record<Side, number> = {
      player: -Infinity,
      ai: -Infinity,
    };

  private serveReceiver: Side =
    'player';

  /**
   * Collisions since the last rendered frame.
   *
   * Handed to the renderer for game-feel effects and
   * cleared after each draw. Not part of the snapshot.
   */
  private readonly impactEvents:
    CollisionEvent[] = [];

  private readonly listeners =
    new Set<Listener>();

  private snapshot:
    GameSnapshot;

  private lastCountdownShown =
    -1;

  private lastSecondShown =
    -1;

  constructor(
    canvas: HTMLCanvasElement,
    difficulty: Difficulty,
    orientation: TableOrientation = 'portrait',
  ) {
    const profile =
      AI_PROFILES[difficulty];

    this.renderer =
      new Renderer(
        canvas,
        orientation,
      );

    this.input =
      new InputManager(
        canvas,
        (x, y, out) =>
          this.renderer.toWorld(x, y, out),
      );

    this.player =
      new Paddle(
        'player',
        PLAYER_BOUNDS,
        PADDLE.playerMaxSpeed,
      );

    this.ai =
      new Paddle(
        'ai',
        AI_BOUNDS,
        profile.maxSpeed,
      );

    this.paddles = [
      this.player,
      this.ai,
    ];

    this.aiController =
      new AIController(
        this.ai,
        profile,
      );

    this.loop =
      new GameLoop(
        {
          update: (dt) =>
            this.update(dt),

          render: (alpha) =>
            this.render(alpha),
        },
        PHYSICS.tickRate,
      );

    this.resizeObserver =
      new ResizeObserver(
        () =>
          this.renderer.resize(),
      );

    this.resizeObserver.observe(
      canvas,
    );

    this.snapshot =
      this.buildSnapshot();
  }

  // ── Public API ────────────────────────────────────────────

  start(): void {
    /*
     * start() runs just after the player clicks Play;
     * the page already has user activation, so the
     * browser lets the audio device open.
     */
    this.audio.unlock();

    this.restart();

    this.loop.start();
  }

  restart(): void {
    this.score = {
      player: 0,
      ai: 0,
    };

    this.stats =
      emptyStats();

    this.elapsed = 0;

    this.lastScorer = null;

    this.lastHitAt = {
      player: -Infinity,
      ai: -Infinity,
    };

    this.lastSecondShown = -1;

    this.beginRound(
      'player',
    );
  }

  pause(): void {
    if (
      this.state !== 'PLAYING' &&
      this.state !== 'COUNTDOWN' &&
      this.state !== 'GOAL'
    ) {
      return;
    }

    this.stateBeforePause =
      this.state;

    this.setState('PAUSED');
  }

  resume(): void {
    if (
      this.state !== 'PAUSED'
    ) {
      return;
    }

    this.setState(
      this.stateBeforePause,
    );
  }

  togglePause(): void {
    if (
      this.state === 'PAUSED'
    ) {
      this.resume();
    } else {
      this.pause();
    }
  }

  destroy(): void {
    this.loop.stop();

    this.input.detach();

    this.resizeObserver.disconnect();

    this.audio.dispose();

    this.listeners.clear();

    this.impactEvents.length = 0;
  }

  subscribe =
    (
      listener: Listener,
    ): (() => void) => {
      this.listeners.add(
        listener,
      );

      return () => {
        this.listeners.delete(
          listener,
        );
      };
    };

  getSnapshot =
    (): GameSnapshot =>
      this.snapshot;

  // ── Loop ──────────────────────────────────────────────────

  private update(
    dt: number,
  ): void {
    this.puck.storePrevious();

    for (
      const paddle of this.paddles
    ) {
      paddle.storePrevious();
    }

    if (
      this.state === 'PAUSED' ||
      this.state === 'MENU' ||
      this.state === 'GAME_OVER'
    ) {
      return;
    }

    const pointer =
      this.input.pointer;

    if (pointer) {
      this.player.setTarget(
        pointer.x,
        pointer.y,
      );
    }

    switch (this.state) {

      case 'COUNTDOWN': {
        /*
         * Everything is frozen until GO: no physics step,
         * so both paddles stay on their home spots. The
         * player's paddle starts chasing the pointer as
         * soon as play begins.
         */
        this.stateTimer -= dt;

        if (
          this.stateTimer <= 0
        ) {
          this.launchServe();

          this.setState(
            'PLAYING',
          );
        } else if (
          Math.ceil(
            this.stateTimer,
          ) !==
          this.lastCountdownShown
        ) {
          this.lastCountdownShown =
            Math.ceil(
              this.stateTimer,
            );

          this.emit();
        }

        break;
      }

      case 'PLAYING': {
        this.aiController.update(
          dt,
          this.puck,
        );

        const result =
          this.physics.step(
            this.puck,
            this.paddles,
            dt,
            true,
          );

        this.recordEvents(
          result.events,
        );

        this.elapsed += dt;

        if (
          Math.floor(
            this.elapsed,
          ) !==
          this.lastSecondShown
        ) {
          this.lastSecondShown =
            Math.floor(
              this.elapsed,
            );

          this.emit();
        }

        if (result.goal) {
          this.onGoal(
            result.goal,
          );
        }

        break;
      }

      case 'GOAL': {
        this.physics.step(
          this.puck,
          this.paddles,
          dt,
          false,
        );

        this.stateTimer -= dt;

        if (
          this.stateTimer <= 0
        ) {
          this.finishGoal();
        }

        break;
      }
    }
  }

  // ── Rendering ─────────────────────────────────────────────

  private render(
    alpha: number,
  ): void {
    this.renderer.draw({
      puck: this.puck,
      player: this.player,
      ai: this.ai,
      alpha,
      impacts: this.impactEvents,
    });

    /*
     * The renderer copied what it needs; clearing
     * in place keeps this allocation-free.
     */
    this.impactEvents.length = 0;
  }

  // ── Rules ─────────────────────────────────────────────────

  private beginRound(
    receiver: Side,
  ): void {
    this.serveReceiver =
      receiver;

    const serveY =
      this.serveReceiver === 'ai'
        ? H / 2 - SERVE_OFFSET
        : H / 2 + SERVE_OFFSET;

    this.puck.reset(
      W / 2,
      serveY,
    );

    this.player.reset(
      W / 2,
      H - PADDLE.homeOffset,
    );

    this.ai.reset(
      W / 2,
      PADDLE.homeOffset,
    );

    this.aiController.reset();

    this.impactEvents.length = 0;

    this.stateTimer =
      RULES.countdownSeconds;

    this.lastCountdownShown =
      RULES.countdownSeconds;

    this.setState(
      'COUNTDOWN',
    );
  }

  /**
   * Set the held puck gliding gently toward the side
   * that receives the serve, so that side gets first
   * touch.
   */
  private launchServe(): void {
    this.audio.playServe();

    const verticalDirection =
      this.serveReceiver === 'player'
        ? 1
        : -1;

    const horizontalRatio =
      (
        Math.random() * 2 - 1
      ) *
      SERVE_HORIZONTAL_RATIO;

    const horizontalSpeed =
      SERVE_SPEED *
      horizontalRatio;

    this.puck.velocity.set(
      horizontalSpeed,
      verticalDirection *
        SERVE_SPEED,
    );
  }

  private onGoal(
    scorer: Side,
  ): void {

    this.renderer.triggerGoalShake();

    this.audio.playGoal();

    this.score = {
      ...this.score,
      [scorer]:
        this.score[scorer] + 1,
    };

    this.lastScorer =
      scorer;

    /*
     * The puck is held on the goal line while the
     * GOAL banner shows.
     */
    this.puck.velocity.set(
      0,
      0,
    );

    this.stateTimer =
      RULES.goalPauseSeconds;

    this.aiController.reset();

    this.setState(
      'GOAL',
    );
  }

  private finishGoal(): void {
    if (
      this.score.player >=
        RULES.winningScore ||
      this.score.ai >=
        RULES.winningScore
    ) {
      this.setState(
        'GAME_OVER',
      );

      return;
    }

    this.beginRound(
      this.lastScorer === 'player'
        ? 'ai'
        : 'player',
    );
  }

  // ── Collision events ─────────────────────────────────────

  private recordEvents(
    events: readonly CollisionEvent[],
  ): void {
    for (
      const event of events
    ) {
      /*
       * A paddle pushing the puck reports a contact on
       * several sub-steps in a row. Treat contacts that
       * close together as one hit, for the stats and
       * for the sound/visual effect.
       */
      if (
        event.type === 'paddle' &&
        event.side
      ) {
        if (
          this.elapsed -
            this.lastHitAt[
              event.side
            ] <
          RULES.hitDebounceSeconds
        ) {
          continue;
        }

        this.lastHitAt[
          event.side
        ] =
          this.elapsed;

        if (
          event.side === 'player'
        ) {
          this.stats.playerHits++;
        } else {
          this.stats.aiHits++;
        }
      }

      this.audio.playCollision(
        event,
      );

      this.impactEvents.push(
        event,
      );
    }

    this.stats.maxPuckSpeed =
      Math.max(
        this.stats.maxPuckSpeed,
        this.puck.speed,
      );
  }

  // ── Snapshot publishing ─────────────────────────────────

  private setState(
    next: GameState,
  ): void {
    this.state = next;

    this.emit();
  }

  private emit(): void {
    this.snapshot =
      this.buildSnapshot();

    for (
      const listener of this.listeners
    ) {
      listener(
        this.snapshot,
      );
    }
  }

  private buildSnapshot():
    GameSnapshot {
    const over =
      this.state ===
      'GAME_OVER';

    return {
      state:
        this.state,

      score: {
        ...this.score,
      },

      countdown:
        this.state ===
        'COUNTDOWN'
          ? Math.max(
              0,
              Math.ceil(
                this.stateTimer,
              ),
            )
          : 0,

      elapsed:
        Math.floor(
          this.elapsed,
        ),

      lastScorer:
        this.lastScorer,

      winner:
        over
          ? this.score.player >
            this.score.ai
            ? 'player'
            : 'ai'
          : null,

      stats: {
        ...this.stats,

        maxPuckSpeed:
          Math.round(
            this.stats.maxPuckSpeed,
          ),
      },
    };
  }
}