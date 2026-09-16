import { AI_PROFILES } from '../game/ai/difficulty';
import { RULES } from '../game/config';
import type { Difficulty, GameSnapshot } from '../types/game';
import { formatTime } from './format';

interface Props {
  snapshot: GameSnapshot;
  difficulty: Difficulty;
  onPause: () => void;
}

export function GameHUD({ snapshot, difficulty, onPause }: Props) {
  return (
    <header className="hud">
      <div className="hud-side hud-ai">
        <span className="hud-label">AI · {AI_PROFILES[difficulty].label}</span>
        <span className="hud-score">{snapshot.score.ai}</span>
      </div>

      <div className="hud-center">
        <span className="hud-timer">{formatTime(snapshot.elapsed)}</span>
        <span className="hud-target">First to {RULES.winningScore}</span>
        <button className="hud-pause" onClick={onPause} aria-label="Pause" disabled={snapshot.state === 'GAME_OVER'}>
          ❚❚
        </button>
      </div>

      <div className="hud-side hud-player">
        <span className="hud-label">You</span>
        <span className="hud-score">{snapshot.score.player}</span>
      </div>
    </header>
  );
}
