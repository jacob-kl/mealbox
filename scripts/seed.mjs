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
  const ingredientsDir = path.join(SEED_DIR, 'ingredients');
  const files = (await readdir(ingredientsDir)).filter((f) => f.endsWith('.json'));

  const ingredients = [];
  const seenNames = new Set();
  for (const file of files) {
    const raw = await readFile(path.join(ingredientsDir, file), 'utf-8');
    const batch = JSON.parse(raw);
    let fileCount = 0;
    for (const ing of batch) {
      // Same name in two files would upsert twice in one batch and silently
      // let the second write win - catch that here instead, at seed time,
      // rather than as a mystery later.
      if (seenNames.has(ing.name)) {
        throw new Error(`Duplicate ingredient name "${ing.name}" (seen again in ${file})`);
      }
      seenNames.add(ing.name);
      ingredients.push(ing);
      fileCount++;
    }
    console.log(`  ${file}: ${fileCount} ingredients`);
  }

  // A single upsert covering all ~58,600 rows is too large a statement for
  // Supabase's statement_timeout to complete - fine back when this was a
  // few hundred hand-curated ingredients, but importing the USDA databases
  // changed the scale by two orders of magnitude and this was never
  // adjusted for that. Batch it: same total upsert, broken into chunks
  // small enough for Postgres to finish each one comfortably.
  const BATCH_SIZE = 500;
  for (let i = 0; i < ingredients.length; i += BATCH_SIZE) {
    const chunk = ingredients.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('ingredients').upsert(chunk, { onConflict: 'name' });
    if (error) {
      throw new Error(
        `Seeding ingredients failed on batch ${i}-${i + chunk.length} of ${ingredients.length}: ${error.message}`
      );
    }
    const done = Math.min(i + BATCH_SIZE, ingredients.length);
    if (done % 5000 < BATCH_SIZE || done === ingredients.length) {
      console.log(`  ...upserted ${done} / ${ingredients.length}`);
    }
  }

  console.log(`Seeded ${ingredients.length} ingredients from ${files.length} files.`);
  return ingredients;
}

/**
 * Supabase's REST layer caps any unpaginated select at a default row limit
 * (commonly 1000), silently - no error, it just quietly hands back a partial
 * result. seedRecipes() needs the COMPLETE list of existing global recipes
 * to correctly match by name, or it will treat already-existing recipes
 * that fell outside that partial window as new and insert duplicates of
 * them instead of updating them in place. This walks the table a page at a
 * time with .range() until a short page confirms there's nothing left,
 * the same pattern lib/fetchAll.js already uses elsewhere in this app for
 * this identical limit.
 */
async function fetchAllExistingRecipes() {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('recipes')
      .select('id, name')
      .is('household_id', null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Fetching existing global recipes failed: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break; // fewer rows than requested means this was the last page
    from += PAGE_SIZE;
  }

  return allRows;
}

/**
 * Global recipes are fully defined by the seed files, but re-running this
 * script must NEVER give an unchanged recipe a new id — any week plan that
 * already references it (week_plan_meals.recipe_id) would have that
 * reference silently nulled out (ON DELETE SET NULL), which is exactly what
 * "my week plan keeps clearing out every time I push an update" was. So: update existing
 * recipes in place by name, only INSERT ones that are genuinely new, and
 * only DELETE ones that were actually removed from the seed files.
 */
async function seedRecipes(ingredients) {
  const ingredientsByName = Object.fromEntries(ingredients.map((i) => [i.name, i]));
  const recipesDir = path.join(SEED_DIR, 'recipes');
  const files = (await readdir(recipesDir)).filter((f) => f.endsWith('.json'));

  const existing = await fetchAllExistingRecipes();
  const existingIdByName = new Map(existing.map((r) => [r.name, r.id]));
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
  const toDelete = existing.filter((r) => !seenNames.has(r.name)).map((r) => r.id);
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
