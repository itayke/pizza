# Dragon Hearth — Plan

## Principle

No real failure. Mistakes are capped or look funny; scores are internal.

## Core loop

Layout per `art/pizza_layout.jpeg`: split ingredient containers on top, dough bowl on the left, pizza peel in the center, dragon on the right, bake gauge between peel and dragon. Placeholder not in the art: Serve button.

1. **Dough** — tap the bowl to pick up a ball, tap the peel to slam it down (it splats out on impact), then press/hold to spread it toward the rim. Enough coverage enables sauce.
2. **Sauce / Cheese** — tap or drag over the dough to paint.
3. **Toppings** — tap to place one, hold to keep dropping.
4. **Bake** — hold the dragon to breathe fire; once the dough is rolled out, the gauge needle climbs from raw to burnt. Land it in the green zone, past it the pizza chars.
5. **Serve** — peel leaves with the pizza, returns empty.

Meta game: later.

## Tech

- PixiJS: mechanics are pixel-level (painting, deformation, particles, cooking shader). DOM overlay for menus later if needed.
- Fixed 4:3 design resolution matching the art, letterboxed; the paper background stretches to fill the margins. Tunables in `src/config.ts`.
- Pointer events for mouse and touch.

## Mechanic designs

- **Dough** — ring of radii, no volume. A press grows radii at its angle with angular falloff, scaled by how close to the edge it lands (none near center); growth slows past the rim and caps just beyond it. Coverage of the rim circle gates sauce; roundness vs. a perfect circle is the internal score.
  - Rendering: polar mesh of spokes × rings over the dough-ball drawing; each spoke stretches to its radius, the center staying firmer than the edge. Each spoke fades into the rolled-base drawing as it nears the rim.
- **Sauce / Cheese** — brush stamps into a render texture masked by the dough; low-res CPU grid tracks coverage.
- **Toppings** — sprites with rotation/scale jitter.
- **Baking** — one doneness value drives a raw → golden → charred filter with noise; fire is the drawn flame with a flicker.
- **Bins** — fixed two-compartment art; each compartment shows its food once unlocked, empty until then.
- **Input** — tool state machine: none → selected → applying. Tap a bin or drag from it.

## Default decisions (revisit after playtesting)

- Tablet and mouse; no hover-only interactions.
- Permissive: silly orders look funny rather than being blocked.
- Bake target zone starts wide.
- Dragon fires while held.

## Open questions

- Dough bowl stays full (endless source); an empty-bowl drawing would allow showing it taken.
- Bins that grow to 2×2 need their own drawings.
- Serve by dragging the peel handle instead of a button?

## Dev

Dev builds show a tuning panel (`src/dev/`) that edits config live; Save writes values back into `src/config.ts` via a dev-server endpoint (`tools/`).

## Art

Drawings in `art/` are cut out by `tools/art/extract.py`. More may be generated from them, especially for animation.

## Milestones

- [x] 0. Scaffold — scaling, rotate hint, layout
- [ ] 1. Input & tools — bin selection, cursor icon, tap vs hold
- [x] 2. Dough kneading — prototype; playtest and tune
- [ ] 3. Sauce & cheese + coverage
- [ ] 4. Toppings
- [ ] 5. Dragon, fire, bake filter, gauge — fire and gauge done, pizza effects next
- [ ] 6. Serve loop & feedback (sound, reactions)
- [ ] 7. Art pass — kid drawings as cut-out sprites (layout done), brush textures, animation
- [ ] 8. Later — meta game, PWA
