import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NavBar } from '@/components/ui';
import RecipeBrowser from '@/components/RecipeBrowser';

export default async function RecipesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single();

  const { data: recipes } = await supabase
    .from('recipes')
    .select('*')
    .or(`household_id.is.null,household_id.eq.${profile?.household_id}`)
    .order('cuisine')
    .order('name');

  return (
    <>
      <NavBar active="/recipes" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <p className="tab-label text-rust mb-1">Recipe library</p>
        <h1 className="font-display text-3xl mb-6">Recipes</h1>
        <RecipeBrowser recipes={recipes || []} />
      </main>
    </>
  );
}
