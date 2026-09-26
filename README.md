# Castle Pizza (working title)

Landscape pizza-making game for touch and mouse. TypeScript + PixiJS + Vite.

## Scripts

- `npm run dev` — dev server, LAN-exposed for tablet testing
- `npm run build` — typecheck + production build
- `npm run preview` — serve the build

Ports are set in `vite.config.ts`.

## Layout

- `src/main.ts` — bootstrap
- `src/config.ts` — all tunables
- `src/core/` — engine-level helpers (viewport scaling)
- `src/scenes/` — screens
- `src/stations/` — interactive props (bins, peel, dragon)
- `src/ui/` — UI helpers
- `ref/` — reference art (not shipped)

Design and milestones: [PLAN.md](PLAN.md).
