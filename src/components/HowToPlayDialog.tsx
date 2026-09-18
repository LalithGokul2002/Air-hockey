import { useEffect } from 'react';
import { RULES } from '../game/config';

interface Props {
  /** Show touch controls instead of mouse and keyboard. */
  touch: boolean;
  onClose: () => void;
}

export function HowToPlayDialog({ touch, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={onClose}>
      <div className="panel menu-help" onClick={(e) => e.stopPropagation()}>
        <h2 id="help-title" className="panel-title">How to play</h2>
        <ul className="menu-help-list">
          <li>
            {touch
              ? 'Drag your finger on your half to move the cyan paddle.'
              : 'Move your mouse to control the cyan paddle.'}
          </li>
          <li>You can only use your own half of the table.</li>
          <li>Where the puck hits your paddle decides where it goes. Swing through it for power.</li>
          <li>
            First to {RULES.winningScore} goals wins. {touch ? 'Tap the pause button to pause.' : 'Esc or P pauses.'}
          </li>
        </ul>
        <div className="button-stack">
          <button className="btn btn-primary" onClick={onClose} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
