import { PICTURE_JUDGE, SHARE_TOPPINGS } from '../config';
import { clamp01, sliceCoverage, type Pizza } from './judge';
import { gridStep } from './Recipe';
import { slicesOf, type Wedge } from './slicing';

const TAU = Math.PI * 2;

/** What's read off a pizza: its sauce and every topping. */
const CHANNELS = ['sauce', ...SHARE_TOPPINGS] as const;
type Channel = (typeof CHANNELS)[number];

/** A pizza to read: as judged, plus its slice edges (angles of rays from its center) and how sauced a slice of it is. */
export type CutPizza = Pizza & { edges: readonly number[]; sauceIn: (slice: Wedge) => number };

/** A pizza as read: how covered each bin is by each channel (0 to 1, as mapped), its slice count and bake level. */
export type Profile = { bins: Record<Channel, number[]>; slices: number; bakeLevel: number };

/**
 * How a sauce or topping compares at the best turn: its score, and how much of each pizza it covers on average (as
 * mapped, 0 to 1).
 */
export type ChannelVerdict = { name: Channel; score: number; picture: number; served: number };

/** How well a served pizza copies a picture: each part 0 to 1, and their weighted mean; and what cover came from. */
export type PictureVerdict = { cover: number; slices: number; bake: number; total: number; channels: ChannelVerdict[] };

/** Coverage from clearMax (nothing) to coverFull (all), so more than plenty counts as plenty. */
function mapped(coverage: number): number {
  const { clearMax, coverFull } = PICTURE_JUDGE;
  return coverFull > clearMax ? clamp01((coverage - clearMax) / (coverFull - clearMax)) : coverage > clearMax ? 1 : 0;
}

/** How much of a wedge from angle `from`, width wide, lies in a slice, radians. */
function overlap(from: number, width: number, slice: Wedge): number {
  let sum = 0;
  // A slice may wrap past a full turn
  for (const shift of [-TAU, 0]) {
    const start = slice.start + shift;
    sum += Math.max(0, Math.min(from + width, start + slice.width) - Math.max(from, start));
  }
  return sum;
}

/** Read a pizza a slice at a time, each slice's coverage spread evenly over the grid-step bins it spans. */
export function profileOf(pizza: CutPizza): Profile {
  const slices = slicesOf(pizza.edges);
  const count = Math.max(1, Math.round(TAU / gridStep()));
  const width = TAU / count;
  const read = (channel: Channel) => {
    const pieces = pizza.pieces.filter((p) => p.topping === channel);
    const coverage = slices.map((slice) => mapped(channel === 'sauce' ? pizza.sauceIn(slice) : sliceCoverage(pieces, slice, pizza.radiusAt)));
    return Array.from({ length: count }, (_, b) => slices.reduce((sum, slice, i) => sum + overlap(b * width, width, slice) * coverage[i], 0) / width);
  };
  const bins = Object.fromEntries(CHANNELS.map((channel) => [channel, read(channel)])) as Record<Channel, number[]>;
  return { bins, slices: slices.length, bakeLevel: pizza.bakeLevel };
}

/** Score a served pizza against a picture, both read as profiles. */
export function comparePicture(picture: Profile, served: Profile): PictureVerdict {
  // Both read with one grid, unless it was tuned in between
  const count = Math.min(picture.bins.sauce.length, served.bins.sauce.length);
  // Only what's on either pizza counts
  const channels = CHANNELS.filter((c) => picture.bins[c].some((v) => v > 0) || served.bins[c].some((v) => v > 0));
  const mean = (bins: number[]) => bins.slice(0, count).reduce((sum, v) => sum + v, 0) / count;
  let cover = channels.length ? 0 : 1;
  let best: ChannelVerdict[] = [];
  for (let turn = 0; turn < count && channels.length; turn++) {
    const scored = channels.map((c) => {
      let both = 0;
      let either = 0;
      for (let b = 0; b < count; b++) {
        const p = picture.bins[c][b];
        const s = served.bins[c][(b + turn) % count];
        both += Math.min(p, s);
        either += Math.max(p, s);
      }
      return { name: c, score: either > 0 ? both / either : 1, picture: mean(picture.bins[c]), served: mean(served.bins[c]) };
    });
    const alike = scored.reduce((sum, c) => sum + c.score, 0) / channels.length;
    if (alike <= cover && best.length) continue;
    cover = alike;
    best = scored;
  }
  const { extraPenalty, missingPenalty, bakeSlack, bakeTolerance, coverWeight, slicesWeight, bakeWeight } = PICTURE_JUDGE;
  const extra = served.slices - picture.slices;
  const slices = clamp01(1 - (extra > 0 ? extra * extraPenalty : -extra * missingPenalty));
  const off = Math.max(0, Math.abs(served.bakeLevel - picture.bakeLevel) - bakeSlack);
  const bake = bakeTolerance > 0 ? clamp01(1 - off / bakeTolerance) : off > 0 ? 0 : 1;
  const weights = coverWeight + slicesWeight + bakeWeight;
  const total = weights > 0 ? (cover * coverWeight + slices * slicesWeight + bake * bakeWeight) / weights : 1;
  return { cover, slices, bake, total, channels: best };
}
