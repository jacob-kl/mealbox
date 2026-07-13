import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NavBar } from '@/components/ui';
import RecipeForm from '@/components/RecipeForm';

export default async function NewRecipePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single();
  if (!profile?.household_id) redirect('/onboarding');

  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('name, serving_qty, serving_unit')
    .order('name');

  return (
    <>
      <NavBar active="/recipes" />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="tab-label text-rust mb-1">Your household&apos;s recipe</p>
        <h1 className="font-display text-3xl mb-6">New Recipe</h1>
        <RecipeForm householdId={profile.household_id} ingredients={ingredients || []} />
      </main>
    </>
  );
}
