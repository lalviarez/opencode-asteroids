# AGENTS.md

## Project

Single-file HTML5 Canvas Asteroids clone: no frameworks, no bundler, no dependencies, no `package.json`. All game logic (~420 lines) lives in `game.js`, loaded by `index.html` via a plain `<script>` tag. No modules — everything is a top-level global; game flow is driven by a module-level `state` variable (`'playing' | 'dead' | 'gameover'`).

## Commands

- Run: open `index.html` directly in a browser, or `npx serve .` → http://localhost:3000.
- No tests, linter, typecheck, or CI exist. All verification is manual, in the browser.

## Git

- Never commit or push unless the user explicitly asks for it. To recommend a commit, ask first and wait for confirmation.

## Gotchas

- Canvas size 800×600 is duplicated: the `<canvas width/height>` attributes in `index.html` and the `W`/`H` constants in `game.js` must be kept in sync, or rendering and edge-wrapping break.
- Input edge detection is consuming: `pressed(code)` reads and clears `justPressed[code]`, so call it exactly once per frame per key. Uses `e.code` names (`'Space'`, `'ArrowLeft'`), not `e.key`.
- The game loop passes `dt` in **seconds** (capped at 0.05) and all velocities are px/sec — don't mix in frame-based math.
- Asteroid sizes are 1–3 and index into the `RADII`/`SPEEDS`/`POINTS` tables, which carry a dummy value at index 0.
- The README mentions power-ups and an "estrella fugaz"; neither exists in the code. Gameplay is ship + 3 asteroid sizes only.

## Conventions

- Comments (including the `// ── Section ──` dividers) are in Spanish; identifiers are in English. Keep this split.
