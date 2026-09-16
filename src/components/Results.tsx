import type { GameSnapshot } from '../types/game';
import { formatTime } from './format';

interface Props {
  snapshot: GameSnapshot;
  onPlayAgain: () => void;
  onMenu: () => void;
}

export function Results({ snapshot, onPlayAgain, onMenu }: Props) {
  const won = snapshot.winner === 'player';
  const { stats, score } = snapshot;

  const rows: [string, string | number][] = [
    ['Match time', formatTime(snapshot.elapsed)],
    ['Your hits', stats.playerHits],
    ['AI hits', stats.aiHits],
    ['Top puck speed', `${stats.maxPuckSpeed} px/s`],
  ];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <div className="panel">
        <p className="eyebrow">Match results</p>
        <h2 id="results-title" className={`panel-title ${won ? 'text-player' : 'text-ai'}`}>
          {won ? 'Victory' : 'Defeat'}
        </h2>

        <div className="final-score">
          <span className="text-player">YOU {score.player}</span>
          <span className="final-score-sep">:</span>
          <span className="text-ai">{score.ai} AI</span>
        </div>

        <dl className="stats">
          {rows.map(([label, value]) => (
            <div key={label} className="stats-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="button-stack">
          <button className="btn btn-primary" onClick={onPlayAgain} autoFocus>
            Play again
          </button>
          <button className="btn btn-ghost" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}
