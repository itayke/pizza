# Dragon Hearth — Plan

## Principle

No real failure. Mistakes are capped or look funny; scores are internal.

## Core loop

Layout per `art/pizza_layout.jpeg`: split ingredient containers on top, dough bowl on the left, pizza peel in the center, dragon on the right, bake gauge between peel and dragon. Not in the layout art, drawn on their own: Serve button, order tray under the bowl (hidden for now: the order shows on its own there, larger), the cutter on the right (a placeholder until drawn).

1. **Dough** — tap the bowl to pick up a ball, tap the peel to slam it down (it splats out on impact), then press/hold to spread it toward the rim. Enough coverage enables sauce.
2. **Sauce / Cheese** — tap a bin to take it (tap again to put it back), then press or drag over the dough to paint sauce or scatter cheese; dragging straight from the bin works too. Kneading pauses while an ingredient is in hand.
3. **Toppings** — tap to place one, hold to keep dropping.
4. **Bake** — hold the dragon to breathe fire; once the dough is rolled out, the gauge needle climbs from raw to burnt. Land it in the green zone, past it the pizza chars.
5. **Slice** — once baked, pick up the cutter. Over the pizza it aims along the line through the center toward the pointer, snapping to an existing cut nearby; a press locks the line (snapped to a coarse angle grid unless on a cut) and dragging cuts along it. Released, a line cut far enough edge to edge is cut whole, and left uncut otherwise. The first cut locks toppings, baking and kneading.
6. **Serve** — enabled once cut; scored against the order as sliced and graded A+ to F on the order; after a moment the slices slide out from the center one after another, making room for a new order on fresh dough. A reaction to come.

Meta game: later.

## Tech

- PixiJS: mechanics are pixel-level (painting, deformation, particles, cooking shader). DOM overlay for menus later if needed.
- Landscape only. A fixed stage matching the art, always shown whole and centered; the paper background fills the margins. Widescreens (16:9 and wider) lay the stations out side by side on a wider stage, each moved and scaled as a whole: the bins in a column, then the bowl over the serve button, then a full-height peel, then the dragon. Tunables in `src/config.ts`.
- Pointer events for mouse and touch.

## Mechanic designs

- **Dough** — ring of radii, no volume. A press grows radii at its angle with angular falloff, scaled by how close to the edge it lands (none near center); growth slows past the rim and caps just beyond it. Coverage of the rim circle gates sauce; roundness vs. a perfect circle is the internal score.
  - Rendering: polar mesh of spokes × rings over the dough-ball drawing; each spoke stretches to its radius, the center staying firmer than the edge. Each spoke fades into the rolled-base drawing as it nears the rim.
- **Sauce / Cheese** — brush stamps into a mask in the dough's polar space (edge = inscribed circle), so paint stretches with the dough and never leaves it; the dough shader thresholds it into a crisp edge with an inner shadow and blends in a tiling pattern. Low-res CPU grid tracks coverage.
  - Sauce laid over toppings starts a pass above them: its own mask, drawn on the dough's mesh and multiplied over a render of the pizza without sauce (so sauce on sauce reads as one layer), up to a capped number of passes; past the cap the newest pass rises over them instead.
- **Scattered toppings** — pieces drop along the drag (and steadily while resting), stored as angle + fraction of the dough edge so they follow it; each piece stacks its raw, baked and burnt sprites for a later bake cross-fade.
- **Toppings** — sprites with rotation/scale jitter.
- **Baking** — one doneness value drives a raw → golden → charred filter with noise; fire is the drawn flame with a flicker. Each topping bakes only from when it lands, so one added late stays fresh.
- **Orders** — a picture of a finished pizza to copy, under the bowl. Each is drawn as a recipe: even slices (at least four, the first cut upright, only counts the cutter's grid can cut), sauce and cheese or not, each whole topping on all slices, half of them or another run of neighbors (the first one on part of the pizza meets the upright cut, so halves are left and right; later ones meet its sides), and a bake (light, just right, well done or burnt). Weirder pizzas may come later. A hidden dough makes it with the game's own art and is snapshotted for the ticket.
  - Scoring a copy: both pizzas are read slice by slice (coverage per sauce and topping, a plainly topped slice counting as full), each slice spread evenly over bins a grid step wide, so extra cuts through a slice change nothing. Cover compares the bins at the served pizza's best turn, each sauce or topping by overlap over union; slices loses a little per extra slice and more per missing one; bake by distance from the pictured level. Toppings baked at their own levels (added after baking) aren't scored yet.
- **Rule orders** (off for now, behind a config switch; too hard to read) — a ticket in the tray, a row of icons per rule, no text: a topping covering some share of the slices and no others (whole means all of them), exactly a count of a topping, or two toppings not touching; plus well baked or burnt when past normal. Rules combine into small puzzles. Drawn orders are kept only if their toppings fit the slices: a shared topping takes its share of them, any other topping kept apart takes one, and toppings kept apart never share a slice. Each rule scores 0–1 (shares by how many slices are covered or clear as asked, counts by how far off, apart pairs by touches, doneness by bake range); the scores stay internal. Icons are placeholders until drawn.
- **Slicing** — the player cuts lines through the center with the cutter; each line is two rays parting slices, and a line is either cut whole or not at all. A piece belongs to the slice its center lies in. Served, the pizza is snapshotted and each slice becomes its own mesh over that snapshot, its sides traced down the middle of the cuts and shared with its neighbors, so pieces on a cut split with it. Orders are still drawn for even auto slicing, so they only ask for shares it can show.
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

Dev builds have a tuning panel (`src/dev/`), hidden behind a corner button (or T) and remembered open or closed per browser, that edits config live, with a filter box that narrows it by name; Save writes values back into `src/config.ts` via a dev-server endpoint (`tools/`). Keys: R resets the dough, S skips ahead (place the dough, roll it to the rim, then cover the inner rim in sauce, then cheese, then bake it just right), O draws a new order, C makes the pictured pizza on the peel. The Orders folder switches between picture and rule orders and shows the order and its live scores.

## Art

Drawings in `art/` are cut out by `tools/art/extract.py`. Undrawn pieces (the sauce brush, order icons) are procedural placeholders from `tools/art/placeholders.py`. More may be generated from them, especially for animation.

Words are text in the hand font, bent on an arc to match the drawn lettering, so new toppings and languages need no new art. Every caption is a word, all at one size.

## Milestones

- [x] 0. Scaffold — scaling, rotate hint, standard and widescreen layouts
- [ ] 1. Input & tools — bin selection, cursor icon, tap vs hold
- [x] 2. Dough kneading — prototype; playtest and tune
- [ ] 3. Sauce & cheese + coverage — sauce painting and cheese scatter done (raw only); cheese coverage and bake cross-fade next
- [ ] 4. Toppings
- [ ] 5. Dragon, fire, bake filter, gauge — fire and gauge done, pizza effects next
- [ ] 6. Serve loop & feedback (sound, reactions) — picture orders, player slicing, scoring and grades done (placeholder cutter), reactions next
- [ ] 7. Art pass — kid drawings as cut-out sprites (layout done), brush textures, animation
- [ ] 8. Later — meta game, PWA
