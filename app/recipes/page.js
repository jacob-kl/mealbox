import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { NavBar, Button } from '@/components/ui';
import RecipeBrowser from '@/components/RecipeBrowser';

export default async function RecipesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single();

  const { data: household } = await supabase.from('households').select('settings').eq('id', profile?.household_id).single();
  const defaultToFull = household?.settings?.recipeDetailDefault !== 'quick';

  const recipes = await fetchAll(() =>
    supabase
      .from('recipes')
      .select('*')
      .or(`household_id.is.null,household_id.eq.${profile?.household_id}`)
      .order('cuisine')
      .order('name')
      .order('id')
  );

  return (
    <>
      <NavBar active="/recipes" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="tab-label text-rust mb-1">Recipe library</p>
            <h1 className="font-display text-3xl">Recipes</h1>
          </div>
          <Link href="/recipes/new">
            <Button>+ New Recipe</Button>
          </Link>
        </div>
        <RecipeBrowser recipes={recipes} defaultToFull={defaultToFull} />
      </main>
    </>
  );
}
