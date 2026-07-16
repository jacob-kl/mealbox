import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NavBar } from '@/components/ui';
import SupportForm from '@/components/SupportForm';

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <>
      <NavBar active="/support" />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <p className="tab-label text-rust mb-1">Mealbox</p>
        <h1 className="font-display text-3xl mb-6">Support</h1>
        <SupportForm />
      </main>
    </>
  );
}
