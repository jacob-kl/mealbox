import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NavBar } from '@/components/ui';
import WeightTracker from '@/components/WeightTracker';

export default async function WeightPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  const { data: household } = await supabase
    .from('households')
    .select('settings')
    .eq('id', profile.household_id)
    .single();
  const units = household?.settings?.units || 'imperial';

  const { data: logs } = await supabase
    .from('weight_logs')
    .select('weight_lb, logged_at')
    .eq('profile_id', user.id)
    .order('logged_at', { ascending: true });

  return (
    <>
      <NavBar active="/weight" />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <p className="tab-label text-rust mb-1">Progress</p>
        <h1 className="font-display text-3xl mb-6">Weight & Targets</h1>
        <WeightTracker profile={profile} logs={logs || []} units={units} />
      </main>
    </>
  );
}
