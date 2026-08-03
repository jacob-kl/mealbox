// lib/substitutions.js
// Suggests swap candidates for an ingredient — same grocery category (so a
// protein doesn't get replaced with a spice), ranked by how close their
// macro density is to the original, so the swap doesn't wreck the recipe's
// nutrition. Always paired in the UI with a free-text custom option, since
// no automatic list will cover every allergy or local availability issue.

// lib/substitutions.js
// Suggests ingredient swaps by CULINARY FUNCTION first, not nutrition
// similarity — matching by macro density alone produced nonsense (bread
// crumbs "swapped" for a hamburger bun; an egg used as a binder in a
// breading step "swapped" for pork shoulder, both matched only because
// they happened to score similarly on protein/carb/fat). Every ingredient
// has a `sub_group` (its specific functional role — "breading_coating" is
// not "bread_bun" is not "poultry_breast_cutlet"), and a curated map below
// says which groups are close enough to reasonably cross-suggest. Macro
// density is only used to rank *within* that already-sensible pool.

// Each group's list of OTHER groups it's reasonable to also pull
// suggestions from. Deliberately conservative — many groups (eggs, dry
// spices, dressings, branded prepared items, supplements) have none at
// all, because there usually isn't a sensible cross-group swap.
//
// An entry is normally just a group name (string) — swap is fine in any
// cooking context. Where a swap is functionally close but genuinely risky
// in SOME cooking methods (curdles under prolonged heat, can't replicate
// structure in baking, etc.), use { group, caveat } instead. The caveat is
// a plain-language heads-up shown in the UI alongside that suggestion —
// it doesn't block the swap (the person cooking knows their own recipe
// better than a static rule can), it just flags the real risk so they can
// judge whether it applies. Same-group matches never carry a caveat by
// design — sub_group is specifically the "safe everywhere" tier, and any
// method-sensitivity should push an ingredient into related-group instead.
const RELATED_GROUPS = {
  poultry_breast_cutlet: ['poultry_thigh_ground', 'red_meat_roast_steak', 'plant_protein_meat_sub'],
  poultry_thigh_ground: ['ground_red_meat', 'poultry_breast_cutlet', 'plant_protein_meat_sub'],
  red_meat_roast_steak: ['ground_red_meat', 'poultry_breast_cutlet'],
  ground_red_meat: ['poultry_thigh_ground', 'red_meat_roast_steak', 'plant_protein_meat_sub'],
  cured_processed_meat: [],
  white_fish_fillet: ['fatty_fish_fillet', 'shellfish'],
  fatty_fish_fillet: ['white_fish_fillet', 'canned_fish'],
  canned_fish: ['fatty_fish_fillet', 'white_fish_fillet'],
  shellfish: ['white_fish_fillet'],
  plant_protein_meat_sub: ['poultry_breast_cutlet', 'ground_red_meat'],
  egg: [],
  protein_powder: [],

  hard_cheese: ['soft_fresh_cheese'],
  soft_fresh_cheese: ['hard_cheese', 'cream_cheese_spread', 'cottage_cheese'],
  cream_cheese_spread: ['soft_fresh_cheese'],
  cottage_cheese: ['soft_fresh_cheese', 'yogurt'],
  milk: [],
  condensed_evap_milk: [],
  yogurt: [{ group: 'sour_cream', caveat: 'Fine cold (dip, topping, marinade base) or stirred in off-heat at the end. Can curdle or thin out in a long-simmered soup or a baked dish that needs real oven heat.' }, 'cottage_cheese'],
  sour_cream: [{ group: 'yogurt', caveat: 'Fine cold (dip, topping) or stirred in off-heat at the end. Can curdle or thin out in a long-simmered soup or a baked dish that needs real oven heat.' }],
  butter_fat: [{ group: 'cooking_oil', caveat: "Fine for sautéing or general frying. In baking, butter's solid-at-room-temp structure (creaming with sugar, lamination in pastry) doesn't come from oil — cookies will spread more and pastry won't flake the same way." }],

  dressing_creamy: [],
  dressing_vinaigrette: [],

  rice: ['other_grain', 'pasta_noodle'],
  pasta_noodle: ['rice', 'other_grain'],
  other_grain: ['rice', 'pasta_noodle', 'starchy_root'],
  bread_bun: ['flatbread_wrap'],
  flatbread_wrap: ['bread_bun'],
  breading_coating: ['snack_cracker'],
  thickener_starch: [{ group: 'baking_flour', caveat: 'Cornstarch-style thickeners lose power with long simmering or added acid (tomato, citrus, vinegar) and can go from thick back to thin. Flour holds up better over a long cook but needs to be cooked into a paste first or it tastes raw.' }],
  baking_flour: [{ group: 'thickener_starch', caveat: 'Works for a quick end-of-cook thickening, but has less staying power than flour in a soup or sauce that simmers a long time or has a lot of acid in it (tomato, citrus, vinegar).' }],
  snack_cracker: ['breading_coating', 'granola'],
  granola: ['snack_cracker'],
  starchy_root: ['other_grain'],

  bean_canned_cooked: ['lentil_split_pea', 'edamame'],
  lentil_split_pea: ['bean_canned_cooked'],
  edamame: ['bean_canned_cooked'],

  leafy_green: [],
  cruciferous: ['pod_veg'],
  allium: ['aromatic_root'],
  aromatic_root: ['allium'],
  nightshade_veg: ['squash', 'canned_chile'],
  canned_chile: ['nightshade_veg'],
  root_veg: [],
  squash: ['nightshade_veg'],
  pod_veg: ['cruciferous'],
  cucumber: [],
  fresh_herb: [],
  asian_crunch_veg: [],
  pickled_briny: [],
  frozen_mixed_veg: [],
  avocado: [],

  citrus_fruit: ['citrus_juice'],
  citrus_juice: ['citrus_fruit', { group: 'vinegar', caveat: "Both add acidity, but vinegar's flavor is sharper and more one-note than citrus — fine for balancing a dish, a poor swap anywhere citrus's own fruity flavor is the point (a citrus-forward marinade, a dessert)." }],
  berry_fruit: [],
  tropical_fruit: [],
  pome_stone_fruit: [],
  banana_plantain: [],

  tree_nut: ['seed'],
  seed: ['tree_nut'],
  nut_seed_butter: [],

  soy_umami_sauce: [{ group: 'miso_paste', caveat: "Miso is a paste, not a liquid — whisk it into a little warm (not boiling) liquid first or it clumps. It also loses its real flavor and turns bitter if boiled hard or simmered a long time, so stir it in near the end rather than at the start." }],
  miso_paste: [{ group: 'soy_umami_sauce', caveat: 'Soy sauce is thinner and saltier-forward rather than deeply savory — fine for a quick umami boost, but a poor stand-in anywhere miso is the main flavor of the dish, not a background note.' }],
  hot_chili_sauce: [],
  tomato_sauce: ['creamy_pasta_sauce', 'herb_sauce'],
  creamy_pasta_sauce: ['tomato_sauce', 'herb_sauce'],
  herb_sauce: ['tomato_sauce', 'creamy_pasta_sauce'],
  simmer_curry_sauce: [],
  dip_spread: [],
  mustard_condiment: [],
  vinegar: ['citrus_juice'],
  cooking_oil: [{ group: 'butter_fat', caveat: "Fine for sautéing or general frying. In baking, butter behaves differently than oil (it's solid at room temp, so it creams with sugar and laminates in pastry) — baked goods will turn out denser or less flaky." }],
  sweetener_liquid: ['sweetener_dry'],
  sweetener_dry: ['sweetener_liquid'],
  chocolate: [],
  broth_stock: ['cooking_wine'],
  cooking_wine: ['broth_stock'],
  nori_wrap: [],
  extract_flavoring: [],
  spice_dry: [],

  prepared_soup: [],
  pancake_mix: [],
  cornbread_mix: [],
  pie_crust: [],
  supplement: [],
  nutritional_yeast: [],
};

function density(ingredient) {
  const cal = ingredient.cal || 1;
  return {
    protein: (ingredient.protein || 0) / cal,
    carbs: (ingredient.carbs || 0) / cal,
    fat: (ingredient.fat || 0) / cal,
  };
}

/**
 * @param {string} ingredientName - the ingredient being replaced
 * @param {Array} ingredientCatalog - full ingredients table (name, cal, protein, carbs, fat, sub_group, dietary_tags, ...)
 * @param {Object} [options]
 * @param {number} [options.maxSuggestions]
 * @param {string} [options.dietaryFilter] - e.g. 'gluten-free', 'dairy-free', 'vegan', 'low-carb' — only
 *   return candidates carrying that tag (for allergies/restrictions)
 * @returns {Array} ingredient rows, best match first
 */
export function suggestSubstitutes(ingredientName, ingredientCatalog, { maxSuggestions = 6, dietaryFilter = null } = {}) {
  const original = ingredientCatalog.find((i) => i.name === ingredientName);
  if (!original || !original.sub_group) return [];

  const group = original.sub_group;
  const relatedEntries = RELATED_GROUPS[group] || [];
  // Related entries can be a plain group name (no caveat) or { group, caveat }.
  // Build a lookup so we can attach the right caveat to each matched ingredient.
  const caveatByGroup = {};
  const relatedGroupNames = relatedEntries.map((entry) => {
    if (typeof entry === 'string') return entry;
    caveatByGroup[entry.group] = entry.caveat;
    return entry.group;
  });

  let sameGroup = ingredientCatalog.filter((i) => i.name !== ingredientName && i.sub_group === group);
  let relatedGroup = ingredientCatalog.filter((i) => i.name !== ingredientName && relatedGroupNames.includes(i.sub_group));

  if (dietaryFilter) {
    sameGroup = sameGroup.filter((i) => (i.dietary_tags || []).includes(dietaryFilter));
    relatedGroup = relatedGroup.filter((i) => (i.dietary_tags || []).includes(dietaryFilter));
  }

  const origDensity = density(original);
  const byCloseness = (list) =>
    list
      .map((i) => {
        const d = density(i);
        const dist = Math.sqrt((d.protein - origDensity.protein) ** 2 + (d.carbs - origDensity.carbs) ** 2 + (d.fat - origDensity.fat) ** 2);
        return { ingredient: i, dist };
      })
      .sort((a, b) => a.dist - b.dist)
      .map((s) => s.ingredient);

  // Same-group matches are functionally safest and always come first —
  // related-group candidates only fill in remaining slots. A close macro
  // match from a related-but-different group (a snack cracker, when the
  // original is a breading crumb) shouldn't outrank a same-group option
  // just because its raw numbers happen to line up better. Same-group
  // matches never carry a caveat; related-group ones pick up whatever
  // caveat was attached to their specific group relationship, if any.
  const sameGroupResults = byCloseness(sameGroup).map((ingredient) => ({ ...ingredient, caveat: null }));
  const relatedGroupResults = byCloseness(relatedGroup).map((ingredient) => ({
    ...ingredient,
    caveat: caveatByGroup[ingredient.sub_group] || null,
  }));

  return [...sameGroupResults, ...relatedGroupResults].slice(0, maxSuggestions);
}

export const DIETARY_FILTERS = ['gluten-free', 'dairy-free', 'vegan', 'low-carb'];
