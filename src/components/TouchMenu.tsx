import { useState } from 'react';
import type { Difficulty } from '../types/game';
import { ControlHints } from './ControlHints';
import { HowToPlayDialog } from './HowToPlayDialog';
import { OpponentPicker } from './OpponentPicker';
import { PlayButton } from './PlayButton';
import './MainMenu.css';
import './TouchMenu.css';

interface Props {
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onPlay: () => void;
}

/**
 * Phone / tablet menu, laid out for a landscape screen: title and PLAY on
 * the left, the opponent list on the right, touch hints along the bottom.
 */
export function TouchMenu({ difficulty, onDifficultyChange, onPlay }: Props) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <main className="menu menu--touch">
      <div className="touch-menu">
        <div className="touch-menu-columns">
          <section className="touch-menu-brand">
            <h1 className="menu-title">Air Hockey</h1>
            <PlayButton onPlay={onPlay} />
            <button className="menu-how" onClick={() => setShowHelp(true)}>
              How to play
            </button>
          </section>

          <OpponentPicker className="touch-menu-opponents" difficulty={difficulty} onChange={onDifficultyChange} />
        </div>

        <ControlHints touch className="touch-menu-hints" />
      </div>

      {showHelp && <HowToPlayDialog touch onClose={() => setShowHelp(false)} />}
    </main>
  );
}
