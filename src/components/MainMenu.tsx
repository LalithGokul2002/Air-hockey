import { useState } from 'react';
import { AI_PROFILES, DIFFICULTY_ORDER } from '../game/ai/difficulty';
import { RULES } from '../game/config';
import type { Difficulty } from '../types/game';

interface Props {
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onPlay: () => void;
}

export function MainMenu({ difficulty, onDifficultyChange, onPlay }: Props) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <main className="menu">
      <div className="menu-panel">
        <h1 className="title">
          Air Hockey
          <span className="title-sub">Neon Arena</span>
        </h1>
        <p className="tagline">React × TypeScript × Canvas</p>

        <fieldset className="difficulty">
          <legend>Select AI</legend>
          {DIFFICULTY_ORDER.map((id) => {
            const profile = AI_PROFILES[id];
            return (
              <label key={id} className={`difficulty-option ${id === difficulty ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="difficulty"
                  value={id}
                  checked={id === difficulty}
                  onChange={() => onDifficultyChange(id)}
                />
                <span className="difficulty-name">{profile.label}</span>
                <span className="difficulty-desc">{profile.description}</span>
              </label>
            );
          })}
        </fieldset>

        <div className="button-stack">
          <button className="btn btn-primary" onClick={onPlay}>
            Play
          </button>
          <button className="btn btn-ghost" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
            How to play
          </button>
        </div>

        {showHelp && (
          <ul className="help">
            <li>Move your mouse, or drag with a finger, to control the cyan paddle.</li>
            <li>You can only use your own half of the table.</li>
            <li>Where the puck hits your paddle decides where it goes. Swing through it for power.</li>
            <li>First to {RULES.winningScore} goals wins. Esc or P pauses.</li>
          </ul>
        )}
      </div>
    </main>
  );
}
