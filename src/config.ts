// All tunables live here. Positions are in design-space pixels (DESIGN_WIDTH × DESIGN_HEIGHT).

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export const COLORS = {
  letterbox: 0x3b2418,
  table: 0x8a5a3b,
  bin: 0xd9b48a,
  binOutline: 0x5a3a24,
  tray: 0xb8bcc2,
  trayRim: 0x7d828a,
  meterBg: 0x2b2b2b,
  meterTarget: 0x6fcf5a,
  dragon: 0x3f9a4a,
  serve: 0xf2a33a,
  label: 0x2a1a10,
} as const;

export const BINS = {
  ids: ['dough', 'sauce', 'cheese', 'olives'] as const,
  top: 40,
  width: 260,
  height: 200,
  gap: 40,
  cornerRadius: 28,
};

export const TRAY = {
  x: 860,
  y: 650,
  radius: 300,
  rimWidth: 18,
};

export const BAKE_METER = {
  x: 1230,
  y: 400,
  width: 50,
  height: 500,
  // Target zone as fraction of the meter (0 = raw, 1 = charred); start generous for kids
  targetMin: 0.55,
  targetMax: 0.8,
};

export const DRAGON = {
  x: 1340,
  y: 450,
  width: 480,
  height: 400,
};

export const SERVE_BUTTON = {
  x: 120,
  y: 590,
  width: 240,
  height: 120,
  cornerRadius: 30,
};

export const LABEL_FONT_SIZE = 36;
