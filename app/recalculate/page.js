import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NavBar, Card } from '@/components/ui';
import RecalculateForm from '@/components/RecalculateForm';

export default async function RecalculatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) redirect('/onboarding');

  const { data: household } = await supabase
    .from('households')
    .select('settings')
    .eq('id', profile.household_id)
    .single();
  const units = household?.settings?.units || 'imperial';

  return (
    <>
      <NavBar active="/weight" />
      <main className="max-w-md mx-auto px-4 py-10">
        <p className="tab-label text-rust mb-2">Mealbox setup</p>
        <Card>
          <h1 className="font-display text-2xl mb-1">Update your macro calculator</h1>
          <p className="text-sm text-ink/60 mb-5">
            Redo this any time your stats or goals change — your household and settings stay the same.
          </p>
          <RecalculateForm profile={profile} units={units} />
        </Card>
      </main>
    </>
  );
}
