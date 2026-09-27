# Castle Pizza (working title)

Landscape pizza-making game for touch and mouse. TypeScript + PixiJS + Vite.

## Scripts

- `npm run dev` — dev server, LAN-exposed for tablet testing
- `npm run build` — typecheck + production build
- `npm run preview` — serve the build

Ports are set in `vite.config.ts`.

## Art

Drawings live in `art/` (paper scans). `python3 tools/art/extract.py` (numpy, pillow, scipy) cuts them into transparent PNGs in `public/assets/` and writes their layout positions to `src/generated/artLayout.ts`. Rerun after changing any drawing.

## Layout

- `src/main.ts` — bootstrap
- `src/config.ts` — all tunables
- `src/core/` — engine-level helpers (viewport, art loading, easing)
- `src/generated/` — tool output, do not edit
- `src/scenes/` — screens
- `src/stations/` — interactive props (bins, dough)
- `src/ui/` — UI helpers
- `src/dev/` — dev-only tools (tuning panel)
- `tools/` — build/dev-server tooling (tuning save endpoint, art extraction)
- `art/` — source drawings (not shipped)
- `ref/` — reference art (not shipped)

Design and milestones: [PLAN.md](PLAN.md).
