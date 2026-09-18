interface Props {
  onPlay: () => void;
}

/** The big glowing PLAY button with its table-circle flares. Styles live in MainMenu.css. */
export function PlayButton({ onPlay }: Props) {
  return (
    <div className="menu-play-row">
      <span className="menu-play-flare is-left" aria-hidden="true" />
      <span className="menu-play-flare is-right" aria-hidden="true" />
      <button className="menu-play" onClick={onPlay}>
        Play
        <svg className="menu-play-chevron" viewBox="0 0 12 20" aria-hidden="true">
          <path d="M2 2l8 8-8 8" />
        </svg>
      </button>
    </div>
  );
}
