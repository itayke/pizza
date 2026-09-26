# Castle Pizza — Plan

## Core loop

Layout per `ref/kitchen-sketch.jpg`: split ingredient containers on top, pizza peel in the center, dragon on the right. Bake meter and Serve are placeholders on the left.

1. **Dough** — place on peel, press/hold to knead; pressing pushes dough away from the pointer.
2. **Sauce / Cheese** — tap or drag over the dough to paint.
3. **Toppings** — tap to place one, hold to keep dropping.
4. **Bake** — hold the dragon to breathe fire; land the meter in the target zone, past it the pizza chars.
5. **Serve** — peel leaves with the pizza, returns empty.

Meta game: later.

## Tech

- PixiJS: mechanics are pixel-level (painting, deformation, particles, cooking shader). DOM overlay for menus later if needed.
- Fixed design resolution, letterboxed. Tunables in `src/config.ts`.
- Pointer events for mouse and touch.

## Mechanic designs

- **Dough** — radial polygon; presses push nearby radii outward, neighbors smoothed.
- **Sauce / Cheese** — brush stamps into a render texture masked by the dough; low-res CPU grid tracks coverage.
- **Toppings** — sprites with rotation/scale jitter.
- **Baking** — one doneness value drives a raw → golden → charred filter with noise; fire as particles.
- **Bins** — each container lists its eventual ingredients; unlocked ones fill a fixed-column grid that gains rows as more unlock.
- **Input** — tool state machine: none → selected → applying. Tap a bin or drag from it.

## Default decisions (revisit after playtesting)

- Tablet and mouse; no hover-only interactions.
- Permissive: silly orders look funny rather than being blocked.
- Bake target zone starts wide.
- Dragon fires while held.

## Open questions

- Dough source: not in the sketch.
- Serve by dragging the peel handle instead of a button?

## Art

The sketch is reference only; final art may be generated from it, especially for animation.

## Milestones

- [x] 0. Scaffold — scaling, rotate hint, greybox layout
- [ ] 1. Input & tools — bin selection, cursor icon, tap vs hold
- [ ] 2. Dough kneading — playtest and tune first
- [ ] 3. Sauce & cheese + coverage
- [ ] 4. Toppings
- [ ] 5. Dragon, fire, bake filter, meter
- [ ] 6. Serve loop & feedback (sound, reactions)
- [ ] 7. Art pass — kid drawings as cut-out sprites and brush textures
- [ ] 8. Later — meta game, PWA
