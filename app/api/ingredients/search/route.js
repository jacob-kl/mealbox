import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// The ingredients table grew from ~400 hand-curated entries to ~58,000
// after importing USDA's databases - far past what's reasonable to fetch
// in full for a client-side search (Supabase also silently caps any
// unbounded select at 1000 rows, so alphabetically-late entries like most
// "Kraft ..." products were never reachable at all once the table passed
// that size). This does the search server-side instead: a handful of
// matching rows over the wire per keystroke, not the whole table once.

// Ingredient names aren't consistent about "and" vs "&" ("Kraft Mac &
// Cheese" but plenty of others spell it out), so a search for one
// wouldn't find the other. Generate both spellings and match either,
// rather than expecting the person typing to guess which one a given
// product happens to use.
function searchVariants(q) {
  const variants = new Set([q]);
  if (/&/.test(q)) variants.add(q.replace(/&/g, 'and'));
  if (/\band\b/i.test(q)) variants.add(q.replace(/\band\b/gi, '&'));
  return [...variants];
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

  const variants = searchVariants(q);
  let query = supabase
    .from('ingredients')
    .select('name, cal, protein, carbs, fat, serving_qty, serving_unit, serving_label, brand');
  query =
    variants.length > 1
      ? query.or(variants.map((v) => `name.ilike.%${v}%`).join(','))
      : query.ilike('name', `%${q}%`);

  // Pull a much bigger candidate pool than we'll actually show - the
  // round-robin below needs enough rows per brand to draw from, not just
  // whatever the first 8-15 alphabetically happen to be.
  const { data, error } = await query
    .order('brand', { ascending: true, nullsFirst: true })
    .order('name')
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const diversified = roundRobinByBrand(data || [], 15);
  return NextResponse.json({ ingredients: diversified });
}
