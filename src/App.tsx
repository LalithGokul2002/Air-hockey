import { useState } from 'react';
import { GameView } from './components/GameView';
import { MainMenu } from './components/MainMenu';
import { RotatePrompt } from './components/RotatePrompt';
import { TouchMenu } from './components/TouchMenu';
import { detectDevice, enterLandscapeFullscreen, isTouchDevice, useIsPortrait } from './device/device';
import type { Difficulty } from './types/game';

type Screen = 'menu' | 'game';

export default function App() {
  // Decided once, before anything runs: laptops/desktops get the existing UI,
  // phones and tablets get the landscape touch UI.
  const [device] = useState(detectDevice);
  const touch = isTouchDevice(device);
  const isPortrait = useIsPortrait();

  const [screen, setScreen] = useState<Screen>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');

  const play = () => {
    // Runs inside the tap, which the browser requires for fullscreen.
    if (touch) void enterLandscapeFullscreen();
    setScreen('game');
  };

  const Menu = touch ? TouchMenu : MainMenu;

  return (
    <>
      {screen === 'game' ? (
        <GameView difficulty={difficulty} device={device} onExit={() => setScreen('menu')} />
      ) : (
        <Menu difficulty={difficulty} onDifficultyChange={setDifficulty} onPlay={play} />
      )}

      {touch && isPortrait && <RotatePrompt />}
    </>
  );
}
