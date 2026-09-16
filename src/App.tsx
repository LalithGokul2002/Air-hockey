import { useState } from 'react';
import { GameView } from './components/GameView';
import { MainMenu } from './components/MainMenu';
import type { Difficulty } from './types/game';

type Screen = 'menu' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');

  if (screen === 'game') {
    return <GameView difficulty={difficulty} onExit={() => setScreen('menu')} />;
  }

  return <MainMenu difficulty={difficulty} onDifficultyChange={setDifficulty} onPlay={() => setScreen('game')} />;
}
