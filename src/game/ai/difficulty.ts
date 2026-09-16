import type { Difficulty } from '../../types/game';

/**
 * Difficulty is a set of AI parameters, not a puck-speed multiplier.
 */
export interface AIProfile {
  label: string;
  description: string;
  /** Top paddle speed in px/s. */
  maxSpeed: number;
  /** Seconds between decisions; the AI keeps its old plan in between. */
  reactionTime: number;
  /** 0 = chases where the puck is, 1 = moves to where the puck will be. */
  predictionAccuracy: number;
  /** Max random aim error in px, re-rolled whenever the AI changes state. */
  aimError: number;
}

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['beginner', 'intermediate', 'advanced', 'expert'];

export const AI_PROFILES: Record<Difficulty, AIProfile> = {
  beginner: {
    label: 'Beginner',
    description: 'Slow to react, chases the puck.',
    maxSpeed: 450,
    reactionTime: 0.25,
    predictionAccuracy: 0.15,
    aimError: 40,
  },
  intermediate: {
    label: 'Intermediate',
    description: 'Reads straight shots.',
    maxSpeed: 700,
    reactionTime: 0.15,
    predictionAccuracy: 0.55,
    aimError: 22,
  },
  advanced: {
    label: 'Advanced',
    description: 'Predicts bank shots, positions well.',
    maxSpeed: 950,
    reactionTime: 0.08,
    predictionAccuracy: 0.85,
    aimError: 10,
  },
  expert: {
    label: 'Expert',
    description: 'Near-perfect reads, fast hands.',
    maxSpeed: 1250,
    reactionTime: 0.03,
    predictionAccuracy: 1,
    aimError: 3,
  },
};
