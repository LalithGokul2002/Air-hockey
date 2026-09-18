import { AI_PROFILES } from '../game/ai/difficulty';
import { RULES } from '../game/config';
import type { Difficulty, GameSnapshot, Side } from '../types/game';
import { formatTime } from './format';

interface Props {
  snapshot: GameSnapshot;
  difficulty: Difficulty;
}

/** Desktop score bar. Pausing is keyboard-only (Esc / P), as the hint bar says. */
export function GameHUD({ snapshot, difficulty }: Props) {
  return (
    <header className="hud">
      <ScoreBlock side="ai" score={snapshot.score.ai} difficulty={difficulty} />
      <MatchClock elapsed={snapshot.elapsed} />
      <ScoreBlock side="player" score={snapshot.score.player} difficulty={difficulty} />
    </header>
  );
}

interface ScoreBlockProps {
  side: Side;
  score: number;
  difficulty: Difficulty;
  className?: string;
}

/** A side's neon score tile plus its label ("AI · Intermediate" or "You"). */
export function ScoreBlock({ side, score, difficulty, className = '' }: ScoreBlockProps) {
  const isAi = side === 'ai';
  return (
    <div className={`hud-side ${isAi ? 'hud-ai' : 'hud-player'} ${className}`}>
      <span className="hud-score" aria-label={`${isAi ? 'AI' : 'Your'} score ${score}`}>
        {score}
      </span>
      <span className="hud-label">
        {isAi ? (
          <>
            <span className="hud-label-tag">AI</span>
            {AI_PROFILES[difficulty].label}
          </>
        ) : (
          'You'
        )}
      </span>
    </div>
  );
}

/** Match timer with the target score underneath. */
export function MatchClock({ elapsed, className = '' }: { elapsed: number; className?: string }) {
  return (
    <div className={`hud-center ${className}`}>
      <span className="hud-timer">{formatTime(elapsed)}</span>
      <span className="hud-target">First to {RULES.winningScore}</span>
    </div>
  );
}
