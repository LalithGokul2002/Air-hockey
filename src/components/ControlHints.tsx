import { RULES } from '../game/config';
import './ControlHints.css';

interface Props {
  className?: string;
  /** Phone/tablet wording: drag and tap instead of mouse and keys. */
  touch?: boolean;
}

/** The row of control reminders shown under the menu and under the table. */
export function ControlHints({ className = '', touch = false }: Props) {
  return (
    <ul className={`control-hints ${className}`}>
      <li>
        {touch ? <DragIcon /> : <MouseIcon />}
        {touch ? 'Drag to move paddle' : 'Mouse moves paddle'}
      </li>
      <li>
        <ShieldIcon />
        Stay in your half
      </li>
      <li>
        <TargetIcon />
        First to {RULES.winningScore} wins
      </li>
      <li>
        <PauseIcon />
        {touch ? 'Tap pause to stop' : 'Esc or P to pause'}
      </li>
    </ul>
  );
}

function DragIcon() {
  return (
    <svg className="control-hint-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5M9.5 4.5 12 2l2.5 2.5M9.5 19.5 12 22l2.5-2.5M4.5 9.5 2 12l2.5 2.5M19.5 9.5 22 12l-2.5 2.5" />
    </svg>
  );
}

function MouseIcon() {
  return (
    <svg className="control-hint-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="6" />
      <path d="M12 7v4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="control-hint-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M12 3v18" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg className="control-hint-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="control-hint-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14M16 5v14" />
    </svg>
  );
}
