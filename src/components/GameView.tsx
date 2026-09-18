import { useEffect, useRef, useState } from 'react';
import { isTouchDevice, useIsPortrait, type DeviceType } from '../device/device';
import { useGame } from '../hooks/useGame';
import type { Difficulty, GameState } from '../types/game';
import { ControlHints } from './ControlHints';
import { GameHUD, MatchClock, ScoreBlock } from './GameHUD';
import { PauseMenu } from './PauseMenu';
import { Results } from './Results';
import './TouchGame.css';

interface Props {
  difficulty: Difficulty;
  device: DeviceType;
  onExit: () => void;
}

/**
 * Desktop: portrait table, score bar above it, keyboard pause.
 * Phone / tablet: landscape table, scores beside it, on-screen pause button.
 */
export function GameView({ difficulty, device, onExit }: Props) {
  const touch = isTouchDevice(device);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { engine, snapshot } = useGame(canvasRef, difficulty, touch ? 'landscape' : 'portrait');
  const isPortrait = useIsPortrait();

  useEffect(() => {
    if (!engine) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') engine.togglePause();
    };
    const onVisibilityChange = () => {
      if (document.hidden) engine.pause();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [engine]);

  // Turning a phone upright covers the table with the rotate prompt, so stop play.
  useEffect(() => {
    if (touch && isPortrait) engine?.pause();
  }, [touch, isPortrait, engine]);

  const { state, countdown, lastScorer } = snapshot;

  /*
   * Flash "GO!" each time a countdown hands over to play. The banner stays
   * mounted and fades itself out with CSS; bumping the key replays it. It is
   * not tied to state === 'PLAYING', so pausing and resuming can't replay it.
   */
  const [goKey, setGoKey] = useState(0);
  const previousState = useRef<GameState>(state);

  useEffect(() => {
    if (previousState.current === 'COUNTDOWN' && state === 'PLAYING') setGoKey((k) => k + 1);
    previousState.current = state;
  }, [state]);

  const arena = (
    <div className="arena">
      <canvas ref={canvasRef} className="arena-canvas" />

      {state === 'COUNTDOWN' && countdown > 0 && (
        <div className="banner banner-countdown" key={countdown}>
          {countdown}
        </div>
      )}

      {goKey > 0 && (
        <div className="banner banner-go" key={goKey} aria-hidden="true">
          GO!
        </div>
      )}

      {state === 'GOAL' && (
        <div className={`banner banner-goal ${lastScorer === 'player' ? 'text-player' : 'text-ai'}`}>
          {lastScorer === 'player' ? 'GOAL!' : 'AI SCORES'}
        </div>
      )}

      {/* On desktop the panels cover just the table; on touch they cover the whole screen (below). */}
      {!touch && renderPanels()}
    </div>
  );

  function renderPanels() {
    return (
      <>
        {state === 'PAUSED' && (
          <PauseMenu
            touch={touch}
            onResume={() => engine?.resume()}
            onRestart={() => engine?.restart()}
            onQuit={onExit}
          />
        )}

        {state === 'GAME_OVER' && (
          <Results snapshot={snapshot} onPlayAgain={() => engine?.restart()} onMenu={onExit} />
        )}
      </>
    );
  }

  if (touch) {
    return (
      <div className="game-screen game-screen--touch">
        <aside className="touch-side">
          <MatchClock elapsed={snapshot.elapsed} />
          <ScoreBlock side="ai" score={snapshot.score.ai} difficulty={difficulty} className="hud-side--stacked" />
        </aside>

        {arena}

        <aside className="touch-side">
          <button
            className="touch-pause"
            onClick={() => engine?.pause()}
            aria-label="Pause"
            disabled={state === 'GAME_OVER' || state === 'PAUSED'}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5 3v10M11 3v10" />
            </svg>
          </button>
          <ScoreBlock side="player" score={snapshot.score.player} difficulty={difficulty} className="hud-side--stacked" />
        </aside>

        {renderPanels()}
      </div>
    );
  }

  return (
    <div className="game-screen">
      <GameHUD snapshot={snapshot} difficulty={difficulty} />
      {arena}
      <ControlHints className="game-hints" />
    </div>
  );
}
