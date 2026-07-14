// scripts/seed.mjs
// Populates the shared ingredient database and the global recipe library.
// Run with: node scripts/seed.mjs
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment
// (the service role key bypasses RLS — never expose it to the browser or
// commit it; it's only used here, from your own machine or CI).

import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRecipeMacros } from '../lib/nutrition.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, '..', 'supabase', 'seed');

// Next.js auto-loads .env.local for `next dev`/`build`, but a plain `node`
// script doesn't get that for free — load it ourselves so `npm run seed`
// works without having to export the variables by hand first.
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
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env.local present — fine if the variables were exported another way.
  }
}
await loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables.\n' +
      'Set them (see .env.example) before running the seed script.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function seedIngredients() {
  const raw = await readFile(path.join(SEED_DIR, 'ingredients.json'), 'utf-8');
  const ingredients = JSON.parse(raw);

  const { error } = await supabase.from('ingredients').upsert(ingredients, { onConflict: 'name' });
  if (error) throw new Error(`Seeding ingredients failed: ${error.message}`);

  console.log(`Seeded ${ingredients.length} ingredients.`);
  return ingredients;
}

/**
 * Global recipes are fully defined by the seed files, but re-running this
 * script must NEVER give an unchanged recipe a new id — any week plan that
 * already references it (week_plan_meals.recipe_id) would have that
 * reference silently nulled out (ON DELETE SET NULL), which is exactly what
 * "my plan clears out every time I push an update" was. So: update existing
 * recipes in place by name, only INSERT ones that are genuinely new, and
 * only DELETE ones that were actually removed from the seed files.
 */
async function seedRecipes(ingredients) {
  const ingredientsByName = Object.fromEntries(ingredients.map((i) => [i.name, i]));
  const recipesDir = path.join(SEED_DIR, 'recipes');
  const files = (await readdir(recipesDir)).filter((f) => f.endsWith('.json'));

  const { data: existing, error: fetchError } = await supabase
    .from('recipes')
    .select('id, name')
    .is('household_id', null);
  if (fetchError) throw new Error(`Fetching existing global recipes failed: ${fetchError.message}`);
  const existingIdByName = new Map((existing || []).map((r) => [r.name, r.id]));
  const seenNames = new Set();

  let updated = 0;
  let inserted = 0;

  for (const file of files) {
    const raw = await readFile(path.join(recipesDir, file), 'utf-8');
    const recipes = JSON.parse(raw);
    let fileCount = 0;

    for (const r of recipes) {
      seenNames.add(r.name);
      let macros;
      try {
        macros = computeRecipeMacros(r.ingredients, ingredientsByName, r.base_servings || 1);
      } catch (err) {
        throw new Error(`In ${file}, recipe "${r.name}": ${err.message}`);
      }
      let macrosFull = null;
      let ingredientsFullWithUnits = null;
      if (r.ingredients_full?.length) {
        try {
          macrosFull = computeRecipeMacros(r.ingredients_full, ingredientsByName, r.base_servings || 1);
        } catch (err) {
          throw new Error(`In ${file}, recipe "${r.name}" (full ingredients): ${err.message}`);
        }
        ingredientsFullWithUnits = r.ingredients_full.map((line) => ({
          ...line,
          unit: ingredientsByName[line.ingredient]?.serving_unit || null,
        }));
      }
      const ingredientsWithUnits = r.ingredients.map((line) => ({
        ...line,
        unit: ingredientsByName[line.ingredient]?.serving_unit || null,
      }));
      const row = {
        household_id: null, // global/shared recipe
        name: r.name,
        cuisine: r.cuisine,
        meal_type: r.meal_type,
        course: r.course || 'complete',
        tags: r.tags || [],
        base_servings: r.base_servings || 1,
        ingredients: ingredientsWithUnits,
        ingredients_full: ingredientsFullWithUnits,
        steps: r.steps || [],
        steps_detailed: r.steps_detailed || null,
        macros_per_serving: macros,
        macros_per_serving_full: macrosFull,
      };

      const existingId = existingIdByName.get(r.name);
      if (existingId) {
        const { error } = await supabase.from('recipes').update(row).eq('id', existingId);
        if (error) throw new Error(`Updating "${r.name}" failed: ${error.message}`);
        updated++;
      } else {
        const { error } = await supabase.from('recipes').insert(row);
        if (error) throw new Error(`Inserting "${r.name}" failed: ${error.message}`);
        inserted++;
      }
      fileCount++;
    }

    console.log(`  ${file}: ${fileCount} recipes`);
  }

  // Only remove recipes that were actually deleted from the seed files —
  // anything still present, even if edited, keeps its id and every
  // reference to it intact.
  const toDelete = (existing || []).filter((r) => !seenNames.has(r.name)).map((r) => r.id);
  if (toDelete.length) {
    const { error } = await supabase.from('recipes').delete().in('id', toDelete);
    if (error) throw new Error(`Removing retired recipes failed: ${error.message}`);
  }

  console.log(`Recipes: ${updated} updated in place, ${inserted} newly added, ${toDelete.length} removed.`);
}

async function main() {
  console.log('Seeding ingredients...');
  const ingredients = await seedIngredients();

  console.log('Seeding recipes...');
  await seedRecipes(ingredients);

  console.log('Done. Existing recipes keep their id across reseeds now, so any week plan');
  console.log('that references them stays intact — only genuinely new or removed recipes change.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
