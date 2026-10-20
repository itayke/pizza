import type { IngredientId } from './config';

// What each label says, as written; LABEL_TEXT decides whether it's set in capitals
export const WORDS: Record<IngredientId | 'dough' | 'order' | 'bakeLevel', string> = {
  sauce: 'Sauce',
  cheese: 'Cheese',
  pepperoni: 'Pepperoni',
  basil: 'Basil',
  pineapple: 'Pineapple',
  olives: 'Olives',
  dough: 'Dough',
  order: 'Order',
  bakeLevel: 'Bake level',
};
