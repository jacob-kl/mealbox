import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// The ingredients table grew from ~400 hand-curated entries to ~58,000
// after importing USDA's databases - far past what's reasonable to fetch
// in full for a client-side search (Supabase also silently caps any
// unbounded select at 1000 rows, so alphabetically-late entries like most
// "Kraft ..." products were never reachable at all once the table passed
// that size). This does the search server-side instead: a handful of
// matching rows over the wire per keystroke, not the whole table once.

// Splits a query into individual required keywords instead of one literal
// phrase, so word order doesn't matter. A literal-phrase match on "mac
// and cheese kraft" can never find "Kraft Mac & Cheese" - the brand name
// comes first there, not last - even though every one of those words is
// genuinely present. Treating each word as its own required condition
// (all of them, in any order) is what actually matches how people type a
// second, clarifying word onto a search that was already close.
function keywords(q) {
  return q.trim().split(/\s+/).filter(Boolean);
}

// Ingredient names aren't consistent about "and" vs "&" ("Kraft Mac &
// Cheese" but plenty of others spell it out). If one of the typed words is
// exactly "and" or "&" on its own, also try the other spelling in that
// same slot, rather than expecting the person to guess which one a given
// product happens to use. Every other word is left alone; this only ever
// produces a second variant, never more, since a query realistically has
// at most one such word.
function keywordListVariants(words) {
  const andIndex = words.findIndex((w) => w.toLowerCase() === 'and');
  if (andIndex !== -1) {
    const swapped = [...words];
    swapped[andIndex] = '&';
    return [words, swapped];
  }
  const ampIndex = words.findIndex((w) => w === '&');
  if (ampIndex !== -1) {
    const swapped = [...words];
    swapped[ampIndex] = 'and';
    return [words, swapped];
  }
  return [words];
}

// A plain "sort by brand, then limit" starves out anything that doesn't
// sort early alphabetically: a popular query like "mac and cheese" can
// have a dozen 365 or Amy's matches alone, which fills the whole limit
// before Kraft or Velveeta - both very real, very findable products - are
// ever reached. Round-robin across brands instead, taking one match per
// brand per pass, so a query that matches five different brands actually
// surfaces all five rather than whichever one happens to come first in
// the alphabet. Every generic (brand null) is its own "bucket" - they
// don't compete with each other for a slot, and (via nullsFirst below)
// always get pulled before any brand's turn in the rotation.
function roundRobinByBrand(rows, limit) {
  const buckets = new Map(); // key -> queue of rows, in their original relative order
  const order = []; // first-seen order of bucket keys, for stable rotation
  let genericCounter = 0;
  for (const row of rows) {
    const key = row.brand == null ? `__generic_${genericCounter++}` : row.brand;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key).push(row);
  }
  const result = [];
  let remaining = true;
  while (result.length < limit && remaining) {
    remaining = false;
    for (const key of order) {
      if (result.length >= limit) break;
      const bucket = buckets.get(key);
      if (bucket.length) {
        result.push(bucket.shift());
        if (bucket.length) remaining = true;
      }
    }
  }
  return result;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ ingredients: [] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const columns = 'name, cal, protein, carbs, fat, serving_qty, serving_unit, serving_label, brand';
  const variants = keywordListVariants(keywords(q));

  // Run each word-list variant as its own query - every word in a variant
  // is required (chaining .ilike() on the same column ANDs the
  // conditions together rather than overriding one another), but a row
  // only needs to satisfy ONE of the (at most two) variants. In parallel
  // since they're independent, then merge and dedupe by name.
  const results = await Promise.all(
    variants.map((wordList) => {
      let variantQuery = supabase.from('ingredients').select(columns);
      for (const word of wordList) {
        variantQuery = variantQuery.ilike('name', `%${word}%`);
      }
      return variantQuery.order('brand', { ascending: true, nullsFirst: true }).order('name').limit(200);
    })
  );

  for (const r of results) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }
  const byName = new Map();
  for (const r of results) {
    for (const row of r.data || []) {
      if (!byName.has(row.name)) byName.set(row.name, row);
    }
  }

  const diversified = roundRobinByBrand([...byName.values()], 15);
  return NextResponse.json({ ingredients: diversified });
}
