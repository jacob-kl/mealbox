import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// The ingredients table grew from ~400 hand-curated entries to ~58,000
// after importing USDA's databases - far past what's reasonable to fetch
// in full for a client-side search (Supabase also silently caps any
// unbounded select at 1000 rows, so alphabetically-late entries like most
// "Kraft ..." products were never reachable at all once the table passed
// that size). This does the search server-side instead: a handful of
// matching rows over the wire per keystroke, not the whole table once.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ ingredients: [] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await supabase
    .from('ingredients')
    .select('name, cal, protein, carbs, fat, serving_qty, serving_unit, serving_label, brand')
    .ilike('name', `%${q}%`)
    // Generic ingredients (brand is null) first, so the picker leads with
    // "Whole milk (generic)" before "Kraft ..." - see schema.sql's note by
    // the brand column for the same convention used elsewhere.
    .order('brand', { ascending: true, nullsFirst: true })
    .order('name')
    .limit(8);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ingredients: data || [] });
}
