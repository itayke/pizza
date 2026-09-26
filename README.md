# Castle Pizza (working title)

A landscape, touch-and-mouse pizza-making game. Pick ingredients from the bins, knead dough, paint sauce and cheese, add toppings, then have the dragon bake it just right and serve.

Built with TypeScript, [PixiJS v8](https://pixijs.com/) and [Vite](https://vite.dev/).

## Getting started

```bash
npm install
npm run dev        # dev server, also exposed on the LAN for testing on a tablet
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

## Project layout

```
src/
  main.ts              app bootstrap
  config.ts            all tunables (layout, colors, gameplay values)
  core/Viewport.ts     fixed 1920×1080 design space, letterboxed to fit the screen
  scenes/KitchenScene.ts  main play screen (greybox for now)
  style.css            full-screen canvas, gesture blocking, rotate-device hint
```

See [PLAN.md](PLAN.md) for the design and milestones.
