export type Side = 'player' | 'ai';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

/**
 * Top-level game state machine.
 *
 *   MENU → COUNTDOWN → PLAYING → GOAL → COUNTDOWN → ... → GAME_OVER
 *                         ↕
 *                       PAUSED
 */
export type GameState = 'MENU' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'GOAL' | 'GAME_OVER';

export interface Score {
  player: number;
  ai: number;
}

export interface MatchStats {
  playerHits: number;
  aiHits: number;
  /** Fastest puck speed seen this match, in world units (px) per second. */
  maxPuckSpeed: number;
}

/**
 * The slice of engine state React is allowed to see. The engine only publishes a new
 * snapshot when something UI-relevant changes, never once per frame.
 */
export interface GameSnapshot {
  state: GameState;
  score: Score;
  /** Whole seconds left on the countdown (0 when not counting down). */
  countdown: number;
  /** Whole seconds of play time. */
  elapsed: number;
  lastScorer: Side | null;
  winner: Side | null;
  stats: MatchStats;
}
