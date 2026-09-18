import './RotatePrompt.css';

/** Covers the screen while a phone or tablet is held upright. */
export function RotatePrompt() {
  return (
    <div className="rotate-prompt" role="alertdialog" aria-labelledby="rotate-title" aria-describedby="rotate-desc">
      <svg className="rotate-prompt-phone" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="20" y="6" width="24" height="44" rx="4" />
        <path d="M29 44h6" />
      </svg>
      <h2 id="rotate-title" className="rotate-prompt-title">
        Rotate your device
      </h2>
      <p id="rotate-desc" className="rotate-prompt-text">
        Air Hockey plays in landscape.
      </p>
    </div>
  );
}
