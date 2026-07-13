import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NavBar } from '@/components/ui';
import SettingsForm from '@/components/SettingsForm';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single();

  const { data: household } = await supabase
    .from('households')
    .select('*')
    .eq('id', profile.household_id)
    .single();

  const { data: members } = await supabase
    .from('profiles')
    .select('id, display_name, color, target_calories, target_protein_g, target_carbs_g, target_fat_g, goal, diet_type')
    .eq('household_id', profile.household_id);

  return (
    <>
      <NavBar active="/settings" />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <p className="tab-label text-rust mb-1">Household</p>
        <h1 className="font-display text-3xl mb-6">Settings</h1>
        <SettingsForm household={household} members={members || []} />
      </main>
    </>
  );
}
