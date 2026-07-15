// lib/cuisineFlags.js
// Single-country cuisines map to one flag. Regional groupings (a cuisine
// tag like "asian" or "mediterranean" spans many countries) map to a list
// — a recipe's flag is picked deterministically from that list based on
// its own name, so the same recipe always shows the same flag, but
// different recipes within the region show genuine variety rather than
// one flag standing in for a whole region.

const CUISINE_FLAGS = {
  chinese: ['🇨🇳'],
  japanese: ['🇯🇵'],
  korean: ['🇰🇷'],
  thai: ['🇹🇭'],
  vietnamese: ['🇻🇳'],
  indian: ['🇮🇳'],
  italian: ['🇮🇹'],
  french: ['🇫🇷'],
  spanish: ['🇪🇸'],
  mexican: ['🇲🇽'],
  american: ['🇺🇸'],
  southern: ['🇺🇸'],
  asian: ['🇨🇳', '🇯🇵', '🇰🇷', '🇹🇭', '🇻🇳', '🇵🇭', '🇲🇾'],
  'middle-eastern': ['🇱🇧', '🇮🇱', '🇹🇷', '🇸🇦', '🇯🇴', '🇪🇬'],
  mediterranean: ['🇬🇷', '🇮🇹', '🇪🇸', '🇭🇷', '🇹🇷', '🇨🇾'],
  caribbean: ['🇯🇲', '🇹🇹', '🇧🇸', '🇵🇷', '🇨🇺', '🇩🇴'],
  'north-african': ['🇲🇦', '🇪🇬', '🇹🇳', '🇩🇿', '🇱🇾'],
  'west-african': ['🇳🇬', '🇬🇭', '🇸🇳', '🇨🇮', '🇲🇱'],
  'east-african': ['🇪🇹', '🇰🇪', '🇹🇿', '🇺🇬', '🇸🇴'],
  'central-african': ['🇨🇩', '🇨🇲', '🇨🇬', '🇬🇦', '🇹🇩'],
  'south-african': ['🇿🇦'],
  // New Mexico is a US state, not a country — there's no flag emoji for it.
  // Standing in with the chile pepper instead feels more honest anyway:
  // "red or green?" is New Mexico's actual official state question.
  'new-mexico': ['🌶️'],
};

function stableIndex(seed, length) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

/**
 * @param {string} cuisine
 * @param {string} seed - something stable per-recipe (its name or id), so
 *   a regional cuisine's flag choice is consistent across renders/reloads
 *   for the same recipe but varies recipe-to-recipe.
 * @returns {string|null} a flag emoji, or null if the cuisine isn't mapped
 */
export function flagFor(cuisine, seed = '') {
  const flags = CUISINE_FLAGS[cuisine];
  if (!flags?.length) return null;
  if (flags.length === 1) return flags[0];
  return flags[stableIndex(seed || cuisine, flags.length)];
}
