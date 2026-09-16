export const TABLE = {
  width: 480,
  height: 800,
  goalWidth: 170,
  goalDepth: 36,
};

export const GOAL_LEFT =
  (TABLE.width - TABLE.goalWidth) / 2;

export const GOAL_RIGHT =
  (TABLE.width + TABLE.goalWidth) / 2;

export const PHYSICS = {
  tickRate: 60,
  substeps: 4,

  /**
   * Fraction of velocity retained after one second.
   *
   * Lower value = puck slows down faster.
   */
  puckDamping: 0.70,

  wallRestitution: 0.82,

  /**
   * Slightly less than 1 prevents paddle impacts
   * from becoming excessively explosive.
   */
  paddleRestitution: 0.78,

  /**
   * Absolute safety limit for puck velocity.
   */
  maxPuckSpeed: 1200,
};

export const PUCK = {
  radius: 16,
  mass: 1,
};

export const PADDLE = {
  radius: 32,
  playerMaxSpeed: 3000,
  homeOffset: 90,
};

export const RULES = {
  winningScore: 7,
  countdownSeconds: 3,
  goalPauseSeconds: 1.5,
  hitDebounceSeconds: 0.15,
};