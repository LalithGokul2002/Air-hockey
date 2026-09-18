import { AI_PROFILES, DIFFICULTY_ORDER } from '../game/ai/difficulty';
import type { Difficulty } from '../types/game';

interface Props {
  difficulty: Difficulty;
  onChange: (difficulty: Difficulty) => void;
  className?: string;
}

/** Filled bars (out of METER_BARS) on each opponent's strength meter. */
const STRENGTH: Record<Difficulty, number> = {
  beginner: 1,
  intermediate: 3,
  advanced: 4,
  expert: 6,
};

const METER_BARS = 6;

/** The "Choose your opponent" panel. Styles live in MainMenu.css. */
export function OpponentPicker({ difficulty, onChange, className = '' }: Props) {
  return (
    <div className={`opponent-panel ${className}`}>
      <fieldset className="opponent-panel-inner">
        <legend className="opponent-legend">Choose your opponent</legend>

        {DIFFICULTY_ORDER.map((id) => {
          const profile = AI_PROFILES[id];
          const selected = id === difficulty;
          return (
            <label key={id} className={`opponent ${selected ? 'is-selected' : ''}`}>
              <input
                className="opponent-input"
                type="radio"
                name="difficulty"
                value={id}
                checked={selected}
                onChange={() => onChange(id)}
              />
              <span className="opponent-radio" aria-hidden="true" />
              <span className="opponent-text">
                <span className="opponent-name">{profile.label}</span>
                <span className="opponent-desc">{profile.description}</span>
              </span>
              <span className="opponent-meter" role="img" aria-label={`Strength ${STRENGTH[id]} of ${METER_BARS}`}>
                {Array.from({ length: METER_BARS }, (_, i) => (
                  <span key={i} className={`opponent-bar ${i < STRENGTH[id] ? 'is-filled' : ''}`} />
                ))}
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
