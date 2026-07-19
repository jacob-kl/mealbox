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
  caribbean: ['🇯🇲', '🇹🇹', '🇧🇸', '🇵🇷', '🇨🇺', '🇩🇴'],
  'north-african': ['🇲🇦', '🇪🇬', '🇹🇳', '🇩🇿', '🇱🇾'],
  'west-african': ['🇳🇬', '🇬🇭', '🇸🇳', '🇨🇮', '🇲🇱'],
  'east-african': ['🇪🇹', '🇰🇪', '🇹🇿', '🇺🇬', '🇸🇴'],
  'central-african': ['🇨🇩', '🇨🇲', '🇨🇬', '🇬🇦', '🇹🇩'],
  'central-american': ['🇬🇹', '🇨🇷', '🇵🇦', '🇭🇳', '🇸🇻', '🇳🇮', '🇧🇿'],
  chilean: ['🇨🇱'],
  paraguayan: ['🇵🇾'],
  uruguayan: ['🇺🇾'],
  bolivian: ['🇧🇴'],
  colombian: ['🇨🇴'],
  ecuadorian: ['🇪🇨'],
  venezuelan: ['🇻🇪'],
  guyanese: ['🇬🇾'],
  surinamese: ['🇸🇷'],
  canadian: ['🇨🇦'],
  australian: ['🇦🇺'],
  'new-zealander': ['🇳🇿'],
  polish: ['🇵🇱'],
  portuguese: ['🇵🇹'],
  irish: ['🇮🇪'],
  swedish: ['🇸🇪'],
  swiss: ['🇨🇭'],
  'south-african': ['🇿🇦'],
  mongolian: ['🇲🇳'],
  peruvian: ['🇵🇪'],
  brazilian: ['🇧🇷'],
  russian: ['🇷🇺'],
  german: ['🇩🇪'],
  argentinian: ['🇦🇷'],
  hawaiian: ['🌺'],
  // These regions get one consistent food icon rather than a country flag,
  // the same treatment as New Mexico's chile — either because no single
  // flag would be honest (the cuisine spans many countries, or excludes
  // most of the continent it's named for) or because a food symbol is
  // simply a better fit than picking one nation to represent the region.
  'new-mexico': ['🌶️'],
  mediterranean: ['🫒'],
  southern: ['🍑'],
  'middle-eastern': ['🫓'],
  'southeast-asian': ['🥥'],
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
