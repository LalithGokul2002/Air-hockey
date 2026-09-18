import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { GameEngine } from '../game/GameEngine';
import type { TableOrientation } from '../game/rendering/Renderer';
import type { Difficulty, GameSnapshot } from '../types/game';

const IDLE_SNAPSHOT: GameSnapshot = {
  state: 'MENU',
  score: { player: 0, ai: 0 },
  countdown: 0,
  elapsed: 0,
  lastScorer: null,
  winner: null,
  stats: { playerHits: 0, aiHits: 0, maxPuckSpeed: 0 },
};

const subscribeNothing = () => () => {};
const getIdleSnapshot = () => IDLE_SNAPSHOT;

/**
 * Bridges the imperative engine and React: creates the engine for the canvas,
 * tears it down on unmount, and re-renders only when the engine publishes a snapshot.
 */
export function useGame(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  difficulty: Difficulty,
  orientation: TableOrientation,
) {
  const [engine, setEngine] = useState<GameEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const instance = new GameEngine(canvas, difficulty, orientation);
    instance.start();
    setEngine(instance);
    return () => {
      instance.destroy();
      setEngine(null);
    };
  }, [canvasRef, difficulty, orientation]);

  const snapshot = useSyncExternalStore(
    engine ? engine.subscribe : subscribeNothing,
    engine ? engine.getSnapshot : getIdleSnapshot,
  );

  return { engine, snapshot };
}
