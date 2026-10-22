# Dragon Hearth (working title)

A fantasy pizza making game by Myra Keren-Detar and Itay Keren, with the help of Claude Code and Gemini. TypeScript + PixiJS + Vite.

## Scripts

- `npm run dev` — dev server, LAN-exposed for tablet testing
- `npm run build` — typecheck + production build
- `npm run preview` — serve the build
- `npm test` — order and slicing tests (Vitest)

Ports are set in `vite.config.ts`.

## Art

Drawings live in `art/` (paper scans). `python3 tools/art/extract.py` (numpy, pillow, scipy) cuts them into transparent PNGs in `public/assets/`, makes the sauce pattern tile, and writes their layout positions and dough shapes to `src/generated/`. Rerun after changing any drawing. `python3 tools/art/placeholders.py` writes procedural stand-ins for art not drawn yet.

Label words are set in code in the hand font (Playpen Sans, OFL, in `public/assets/fonts/`), with their text in `src/words.ts`; the drawn labels only mark where each word sits. The font file is subset to Latin; to add a script, subset the full font from Google Fonts with `pyftsubset` (fonttools) to cover it.

## Layout

- `src/main.ts` — bootstrap
- `src/config.ts` — all tunables
- `src/core/` — engine-level helpers (viewport, art loading, easing)
- `src/generated/` — tool output, do not edit
- `src/scenes/` — screens
- `src/stations/` — interactive props (bins, dough, sauce, toppings, order ticket)
- `src/words.ts` — what each label says
- `src/orders/` — orders: drawing them (pictures to copy, or rule puzzles) and scoring a pizza against one
- `src/dev/` — dev-only tools (tuning panel)
- `tools/` — build/dev-server tooling (tuning save endpoint, art extraction)
- `art/` — source drawings (not shipped)
- `ref/` — reference art (not shipped)

Design and milestones: [PLAN.md](PLAN.md).
