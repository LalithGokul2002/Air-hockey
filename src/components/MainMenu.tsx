import { useState } from 'react';
import type { Difficulty } from '../types/game';
import { ControlHints } from './ControlHints';
import { HowToPlayDialog } from './HowToPlayDialog';
import { OpponentPicker } from './OpponentPicker';
import { PlayButton } from './PlayButton';
import './MainMenu.css';

interface Props {
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onPlay: () => void;
}

/** Desktop / laptop menu: one centred column. */
export function MainMenu({ difficulty, onDifficultyChange, onPlay }: Props) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <main className="menu">
      <div className="menu-content">
        <h1 className="menu-title">Air Hockey</h1>

        <OpponentPicker difficulty={difficulty} onChange={onDifficultyChange} />

        <PlayButton onPlay={onPlay} />

        <button className="menu-how" onClick={() => setShowHelp(true)}>
          How to play
        </button>

        <ControlHints className="menu-hints" />
      </div>

      {showHelp && <HowToPlayDialog touch={false} onClose={() => setShowHelp(false)} />}
    </main>
  );
}
