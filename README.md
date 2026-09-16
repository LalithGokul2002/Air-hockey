# Air Hockey — Neon Arena

A real-time 2D air hockey game built from scratch in **TypeScript + HTML5 Canvas**, with a **React** interface on top. There's no game engine or physics library: the loop, physics, collisions and AI are all written by hand.

## Running it

```bash
npm install
npm run dev
```

Other scripts: `npm run build` (type-check and production build) and `npm run typecheck`.

## Architecture

React owns the application layer (menus, HUD, overlays). The game engine is plain TypeScript and knows nothing about React. The two meet in a single hook, `useGame`. The engine publishes a small `GameSnapshot` only when something UI-relevant changes (score, state, timer second), and React subscribes with `useSyncExternalStore`, so React never re-renders once per frame.

```
src/
├── components/          React UI: MainMenu, GameView, GameHUD, PauseMenu, Results
├── hooks/useGame.ts     Engine lifecycle + snapshot subscription
├── types/game.ts        Shared types (GameState, GameSnapshot, ...)
└── game/
    ├── GameEngine.ts    Game state machine, rules, wiring
    ├── GameLoop.ts      Fixed-timestep loop (60 Hz physics, display-rate rendering)
    ├── InputManager.ts  Pointer events → world-space paddle target
    ├── config.ts        All tuning constants
    ├── entities/        Puck, Paddle
    ├── physics/         Vector2, PhysicsEngine (sub-stepping), CollisionSystem
    ├── ai/              AIController (state machine), PuckPrediction, difficulty profiles
    └── rendering/       Renderer (world→screen transform, interpolation, neon drawing)
```

### Engine notes

- **Fixed timestep.** Physics ticks at a fixed 60 Hz no matter what the display refresh rate is. The accumulator carries leftover time, and rendering interpolates between the last two ticks so motion stays smooth at 120/144 Hz.
- **Sub-stepping.** Each tick is split into 4 sub-steps, so a puck at top speed moves under 7 px per step and can't tunnel through a paddle.
- **Kinematic paddles.** Paddles chase a target at a capped speed. Their velocity comes from how far they actually moved, so swinging through the puck hits harder.
- **Collision response.** Circle–circle detection, positional correction along the normal, then the relative velocity is reflected along that normal with restitution. Where the puck meets the paddle sets the exit angle. Goal posts are circle–point collisions.
- **Goals.** A goal counts when the puck's centre crosses the line between the posts. The check runs straight after each sub-step's movement, so the puck can't bounce back out first, and a puck that clips a post is handled by the post collision instead.
- **AI state machine.** The AI has five states: `DEFEND`, `TRACK`, `ATTACK`, `RETURN`, and `CLEAR` (for a puck stuck against its back wall, where the paddle can't get behind it). `TRACK` predicts where the puck will cross the defence line with a small forward simulation that uses the same friction and wall bounces as the real physics.
- **Difficulty as parameters.** Each level sets the AI's top speed, reaction time, prediction accuracy and aim error.

## Roadmap

- [x] **Phase 1 — Playable:** canvas, puck, paddles, walls, goals, score, game loop, mouse/touch input
- [x] **Phase 2 — Engine:** Vector2, sub-stepped physics, collision resolution, game state machine, AI opponent
- [ ] **Phase 3 — Impressive:** friction-aware prediction, particles + object pool, Web Audio sound, adaptive AI
- [ ] **Phase 4 — Frontend polish:** settings, post-match charts, responsive refinements
- [ ] **Phase 5 — Showcase:** Engine Lab debug overlay (FPS, timings, hitboxes, velocity vectors, AI target and predicted path)
