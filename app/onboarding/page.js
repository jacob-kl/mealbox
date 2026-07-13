'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, Button } from '@/components/ui';
import MacroCalculatorForm from '@/components/MacroCalculatorForm';

function randomInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function OnboardingPage() {
  const supabase = createClient();
  const router = useRouter();

  const [step, setStep] = useState('household'); // household -> details
  const [mode, setMode] = useState('create'); // create | join
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState(null);
  const [householdId, setHouseholdId] = useState(null);
  const [createdInviteCode, setCreatedInviteCode] = useState(null);

  async function handleHouseholdSubmit(e) {
    e.preventDefault();
    setError(null);

    if (mode === 'create') {
      const code = randomInviteCode();
      const { data, error } = await supabase
        .from('households')
        .insert({ name: householdName || 'My Household', invite_code: code })
        .select()
        .single();
      if (error) return setError(error.message);
      setHouseholdId(data.id);
      setCreatedInviteCode(code);
    } else {
      const { data, error } = await supabase.rpc('household_id_for_invite_code', {
        code: inviteCode.trim().toUpperCase(),
      });
      if (error || !data) return setError('No household found with that invite code.');
      setHouseholdId(data);
    }
    setStep('details');
  }

  async function handleDetailsSubmit({ rawInputs, targets }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      household_id: householdId,
      ...rawInputs,
      target_calories: targets.calories,
      target_protein_g: targets.proteinG,
      target_carbs_g: targets.carbsG,
      target_fat_g: targets.fatG,
      needs_recalc: false,
      onboarded: true,
    });

    if (profileError) throw new Error(profileError.message);

    await supabase
      .from('weight_logs')
      .insert({ profile_id: user.id, weight_lb: rawInputs.baseline_weight_lb });

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="tab-label text-rust mb-2 text-center">Mealbox setup</p>

        {step === 'household' && (
          <Card>
            <h1 className="font-display text-2xl mb-4">Your household</h1>
            <div className="flex gap-2 mb-5">
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`flex-1 rounded-card py-2 text-sm font-medium border ${mode === 'create' ? 'bg-pine text-white border-pine' : 'border-line'}`}
              >
                Create new
              </button>
              <button
                type="button"
                onClick={() => setMode('join')}
                className={`flex-1 rounded-card py-2 text-sm font-medium border ${mode === 'join' ? 'bg-pine text-white border-pine' : 'border-line'}`}
              >
                Join existing
              </button>
            </div>

            <form onSubmit={handleHouseholdSubmit} className="space-y-3">
              {mode === 'create' ? (
                <input
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="Household name (e.g. The Smiths)"
                  className="w-full border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
                />
              ) : (
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Invite code"
                  required
                  className="w-full border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine uppercase"
                />
              )}
              {error && <p className="text-sm text-rust">{error}</p>}
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          </Card>
        )}

        {createdInviteCode && step === 'details' && (
          <div className="mb-4 text-sm bg-gold/20 rounded-card p-3 text-center">
            Invite code for your household: <strong className="font-mono">{createdInviteCode}</strong>
            <br />
            Share it so the rest of your household can join.
          </div>
        )}

        {step === 'details' && (
          <Card>
            <h1 className="font-display text-2xl mb-1">Your macro calculator</h1>
            <p className="text-sm text-ink/60 mb-5">
              Used to set your personal calorie and macro targets. You can recalculate any time
              from the Weight page.
            </p>
            <MacroCalculatorForm onSubmit={handleDetailsSubmit} submitLabel="Calculate my targets & finish" />
          </Card>
        )}
      </div>
    </main>
  );
}
