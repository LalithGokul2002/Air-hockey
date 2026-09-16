import { useEffect, useRef } from 'react';
import { useGame } from '../hooks/useGame';
import type { Difficulty } from '../types/game';
import { GameHUD } from './GameHUD';
import { PauseMenu } from './PauseMenu';
import { Results } from './Results';

interface Props {
  difficulty: Difficulty;
  onExit: () => void;
}

export function GameView({ difficulty, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { engine, snapshot } = useGame(canvasRef, difficulty);

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

  const { state, countdown, lastScorer } = snapshot;

  return (
    <div className="game-screen">
      <GameHUD snapshot={snapshot} difficulty={difficulty} onPause={() => engine?.pause()} />

      <div className="arena">
        <canvas ref={canvasRef} className="arena-canvas" />

        {state === 'COUNTDOWN' && countdown > 0 && (
          <div className="banner banner-countdown" key={countdown}>
            {countdown}
          </div>
        )}

        {state === 'GOAL' && (
          <div className={`banner banner-goal ${lastScorer === 'player' ? 'text-player' : 'text-ai'}`}>
            {lastScorer === 'player' ? 'GOAL!' : 'AI SCORES'}
          </div>
        )}

        {state === 'PAUSED' && (
          <PauseMenu onResume={() => engine?.resume()} onRestart={() => engine?.restart()} onQuit={onExit} />
        )}

        {state === 'GAME_OVER' && (
          <Results snapshot={snapshot} onPlayAgain={() => engine?.restart()} onMenu={onExit} />
        )}
      </div>
    </div>
  );
}
