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

async function seedRecipes(ingredients) {
  const ingredientsByName = Object.fromEntries(ingredients.map((i) => [i.name, i]));
  const recipesDir = path.join(SEED_DIR, 'recipes');
  const files = (await readdir(recipesDir)).filter((f) => f.endsWith('.json'));

  // Global recipes (household_id null) are fully defined by the seed files —
  // clear them first so re-running this script is safe and never duplicates.
  const { error: clearError } = await supabase.from('recipes').delete().is('household_id', null);
  if (clearError) throw new Error(`Clearing existing global recipes failed: ${clearError.message}`);

  let total = 0;
  for (const file of files) {
    const raw = await readFile(path.join(recipesDir, file), 'utf-8');
    const recipes = JSON.parse(raw);

    const rows = recipes.map((r) => {
      let macros;
      try {
        macros = computeRecipeMacros(r.ingredients, ingredientsByName, r.base_servings || 1);
      } catch (err) {
        throw new Error(`In ${file}, recipe "${r.name}": ${err.message}`);
      }
      return {
        household_id: null, // global/shared recipe
        name: r.name,
        cuisine: r.cuisine,
        meal_type: r.meal_type,
        tags: r.tags || [],
        base_servings: r.base_servings || 1,
        ingredients: r.ingredients,
        steps: r.steps || [],
        macros_per_serving: macros,
      };
    });

    const { error } = await supabase.from('recipes').insert(rows);
    if (error) throw new Error(`Seeding recipes from ${file} failed: ${error.message}`);

    total += rows.length;
    console.log(`  ${file}: ${rows.length} recipes`);
  }

  console.log(`Seeded ${total} recipes total.`);
}

async function main() {
  console.log('Seeding ingredients...');
  const ingredients = await seedIngredients();

  console.log('Seeding recipes...');
  await seedRecipes(ingredients);

  console.log('Done. Global recipes are fully replaced on every run — household-specific');
  console.log('custom recipes (household_id set) are untouched.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
