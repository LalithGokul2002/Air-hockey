interface Props {
  /** Touch devices have no keyboard, so skip the Esc / P hint. */
  touch?: boolean;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

export function PauseMenu({ touch = false, onResume, onRestart, onQuit }: Props) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="panel">
        <h2 id="pause-title" className="panel-title">Paused</h2>
        <div className="button-stack">
          <button className="btn btn-primary" onClick={onResume} autoFocus>
            Resume
          </button>
          <button className="btn" onClick={onRestart}>
            Restart match
          </button>
          <button className="btn btn-ghost" onClick={onQuit}>
            Quit to menu
          </button>
        </div>
        {!touch && <p className="hint">Esc or P to resume</p>}
      </div>
    </div>
  );
}
