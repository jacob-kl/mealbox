// scripts/fix-zero-macros.mjs
// One-off repair: some week_plan_meals rows have a cached computed_macros
// (and/or computed_macros_full) of all zeros, left over from an ingredient
// swap made while the ingredient search had the 1000-row cap bug - the
// swap likely couldn't find the ingredient it needed and wrote a zeroed
// result instead of failing loudly. Those rows still have a real
// ingredients_override, so the fix is to recompute from that override
// using the current (correct, complete) ingredient data - not to just
// clear the cache, which would fall back to the ORIGINAL recipe's macros
// and silently lose whatever swap was actually made.
//
// Run with: node scripts/fix-zero-macros.mjs
// Requires the same SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY as seed.mjs
// (reads .env.local the same way).

import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRecipeMacros } from '../lib/nutrition.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, '..', 'supabase', 'seed');

async function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  try {
    const raw = await readFile(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // no .env.local - fine if the vars are already exported
  }
}
await loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loadAllIngredients() {
  const ingredientsDir = path.join(SEED_DIR, 'ingredients');
  const files = (await readdir(ingredientsDir)).filter((f) => f.endsWith('.json'));
  const ingredients = [];
  for (const file of files) {
    const raw = await readFile(path.join(ingredientsDir, file), 'utf-8');
    ingredients.push(...JSON.parse(raw));
  }
  return Object.fromEntries(ingredients.map((i) => [i.name, i]));
}

async function main() {
  const ingredientsByName = await loadAllIngredients();

  // Deliberately broad and simple rather than trying to filter to "only
  // the zeroed ones" server-side with a JSONB path filter - that's fragile
  // syntax to get right without a live database to test against, and
  // recomputing a cache that was already correct just rewrites the same
  // value, so it's safe to do for every overridden meal rather than only
  // the ones we suspect are bad.
  const { data: meals, error } = await supabase
    .from('week_plan_meals')
    .select('id, recipe_id, ingredients_override, ingredients_full_override, recipe:recipe_id(base_servings)');
  if (error) throw new Error(`Fetching meals failed: ${error.message}`);

  const affected = (meals || []).filter((m) => m.ingredients_override?.length || m.ingredients_full_override?.length);
  console.log(`${meals?.length ?? 0} total meals, ${affected.length} have an ingredient override to recompute.`);

  let fixed = 0;
  let skipped = 0;
  for (const meal of affected) {
    const baseServings = meal.ingredients_override?.length ? 1 : meal.recipe?.base_servings || 1;
    let computed_macros;
    let computed_macros_full;
    try {
      if (meal.ingredients_override?.length) {
        computed_macros = computeRecipeMacros(meal.ingredients_override, ingredientsByName, baseServings);
      }
      if (meal.ingredients_full_override?.length) {
        computed_macros_full = computeRecipeMacros(meal.ingredients_full_override, ingredientsByName, baseServings);
      }
    } catch (err) {
      console.warn(`  Skipping meal ${meal.id}: ${err.message}`);
      skipped++;
      continue;
    }
    const update = {};
    if (computed_macros !== undefined) update.computed_macros = computed_macros;
    if (computed_macros_full !== undefined) update.computed_macros_full = computed_macros_full;
    const { error: updateError } = await supabase.from('week_plan_meals').update(update).eq('id', meal.id);
    if (updateError) {
      console.warn(`  Failed to update meal ${meal.id}: ${updateError.message}`);
      skipped++;
      continue;
    }
    fixed++;
    console.log(`  Recomputed meal ${meal.id}: cal=${computed_macros?.cal ?? '(full-list only)'}`);
  }

  console.log(`Done. ${fixed} recomputed, ${skipped} skipped (see warnings above for why).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
