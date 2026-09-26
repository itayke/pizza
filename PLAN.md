# Castle Pizza — Plan

## Core loop

Landscape screen: ingredient bins along the top, the tray in the center, bake meter + dragon on the right, Serve button on the left.

1. **Dough** — select, place on tray, then press/hold to knead. Pressing pushes the dough away from the pointer, spreading it out.
2. **Sauce / Cheese** — select, then tap or press-and-drag over the dough to paint it on.
3. **Toppings** (olives, mushrooms, …) — select, then tap to place one, or hold to keep dropping them.
4. **Bake** — hold the dragon to breathe fire at the pizza. The bake meter rises; land it in the target zone. Past it, the pizza chars.
5. **Serve** — tray slides away with the pizza and returns empty.

Meta game: later.

## Tech

- **PixiJS v8 + Vite + TypeScript.** The mechanics are pixel-level (painting, deformation, particles, cooking shader), which suits a 2D WebGL renderer over DOM/React. A DOM overlay can be added for menus/meta later.
- Fixed 1920×1080 design space, letterboxed. All tunables in `src/config.ts`.
- Unified pointer events for mouse and touch.

## Mechanic designs

- **Dough**: a radial polygon (~64 radii around a center). Pressing pushes nearby radii outward; neighbors are smoothed each frame so it stays blobby. Goal: reach a target size.
- **Sauce / Cheese**: brush stamps into a render texture masked by the dough shape. A low-res CPU coverage grid (e.g. 32×32) tracks how much is covered, for scoring and orders.
- **Toppings**: sprites with random rotation/scale jitter; hold drops them on a timer.
- **Baking**: a single doneness value (0 raw → 1 charred) drives a filter: pale → golden → brown → charred, with noise for uneven browning. Fire is a particle stream from the dragon's mouth.
- **Input**: tool state machine: none → selected → applying. Tap a bin to select, or drag straight from a bin. The selected tool shows as a cursor icon (on touch, only while pressing).

## Default decisions (revisit after playtesting)

- Works on both tablet and mouse; no hover-only interactions.
- Permissive: silly orders (sauce on a bare tray) are allowed and should look funny, not be blocked.
- Bake target zone starts wide; tighten via config.
- Dragon fires while held (finer control than tap bursts).

## Milestones

- [x] **0. Scaffold** — Vite + TS + Pixi, letterbox scaling, rotate-device hint, greybox layout.
- [ ] **1. Input & tools** — bin selection, cursor icon, tap vs hold detection.
- [ ] **2. Dough kneading** — the riskiest "is it fun?" piece; playtest and tune first.
- [ ] **3. Sauce & cheese painting** + coverage grid.
- [ ] **4. Toppings.**
- [ ] **5. Dragon, fire, bake filter, bake meter.**
- [ ] **6. Serve loop & feedback** — sounds, a happy reaction, maybe stars.
- [ ] **7. Art pass** — scan the kid drawings, cut out as transparent PNGs, keep the hand-drawn feel (a subtle "boiling line" wobble); crops of her coloring become brush textures.
- [ ] **8. Later** — meta game, PWA install for full-screen tablet play.
