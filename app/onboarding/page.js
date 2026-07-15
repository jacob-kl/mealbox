'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, Button } from '@/components/ui';
import MacroCalculatorForm from '@/components/MacroCalculatorForm';
import { randomInviteCode } from '@/lib/inviteCode';

export default function OnboardingPage() {
  const supabase = createClient();
  const router = useRouter();

  const [step, setStep] = useState('household'); // household -> details | prefilled
  const [mode, setMode] = useState('create'); // create | join | personal
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [personalCode, setPersonalCode] = useState('');
  const [error, setError] = useState(null);
  const [householdId, setHouseholdId] = useState(null);
  const [createdInviteCode, setCreatedInviteCode] = useState(null);
  const [units, setUnits] = useState('imperial');
  const [prefill, setPrefill] = useState(null); // { displayName, calories, proteinG, carbsG, fatG }
  const [prefillBusy, setPrefillBusy] = useState(false);

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
      setStep('details');
    } else if (mode === 'join') {
      const { data, error } = await supabase.rpc('household_id_for_invite_code', {
        code: inviteCode.trim().toUpperCase(),
      });
      if (error || !data) return setError('No household found with that invite code.');
      setHouseholdId(data);
      const { data: household } = await supabase.from('households').select('settings').eq('id', data).single();
      setUnits(household?.settings?.units || 'imperial');
      setStep('details');
    } else {
      // personal code - someone the head of kitchen already set up
      const { data, error } = await supabase.rpc('lookup_personal_invite_code', {
        code: personalCode.trim().toUpperCase(),
      });
      const row = data?.[0];
      if (error || !row) return setError('No invite found with that code.');
      setHouseholdId(row.household_id);
      const { data: household } = await supabase.from('households').select('settings').eq('id', row.household_id).single();
      setUnits(household?.settings?.units || 'imperial');
      if (row.prefill_target_calories) {
        setPrefill({
          displayName: row.display_name,
          calories: row.prefill_target_calories,
          proteinG: row.prefill_target_protein_g,
          carbsG: row.prefill_target_carbs_g,
          fatG: row.prefill_target_fat_g,
        });
        setStep('prefilled');
      } else {
        setPrefill({ displayName: row.display_name });
        setStep('details');
      }
    }
  }

  async function finishProfile({ rawInputs, targets }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      household_id: householdId,
      household_role: mode === 'create' ? 'head_of_kitchen' : 'member',
      ...rawInputs,
      target_calories: targets.calories,
      target_protein_g: targets.proteinG,
      target_carbs_g: targets.carbsG,
      target_fat_g: targets.fatG,
      needs_recalc: false,
      onboarded: true,
    });

    if (profileError) throw new Error(profileError.message);

    await supabase.from('weight_logs').insert({ profile_id: user.id, weight_lb: rawInputs.baseline_weight_lb });

    if (mode === 'personal') {
      await supabase.rpc('consume_personal_invite_code', { code: personalCode.trim().toUpperCase() });
    }

    router.push('/dashboard');
    router.refresh();
  }

  async function acceptPrefilledMacros() {
    setPrefillBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      household_id: householdId,
      household_role: 'member',
      display_name: prefill.displayName,
      target_calories: prefill.calories,
      target_protein_g: prefill.proteinG,
      target_carbs_g: prefill.carbsG,
      target_fat_g: prefill.fatG,
      needs_recalc: false,
      onboarded: true,
    });
    setPrefillBusy(false);
    if (profileError) return setError(profileError.message);

    await supabase.rpc('consume_personal_invite_code', { code: personalCode.trim().toUpperCase() });
    router.push('/dashboard');
    router.refresh();
  }

  function calculateInsteadOfPrefill() {
    setStep('details');
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
                className={`flex-1 rounded-card py-2 text-xs font-medium border ${mode === 'create' ? 'bg-pine text-white border-pine' : 'border-line'}`}
              >
                Create new
              </button>
              <button
                type="button"
                onClick={() => setMode('join')}
                className={`flex-1 rounded-card py-2 text-xs font-medium border ${mode === 'join' ? 'bg-pine text-white border-pine' : 'border-line'}`}
              >
                Join existing
              </button>
              <button
                type="button"
                onClick={() => setMode('personal')}
                className={`flex-1 rounded-card py-2 text-xs font-medium border ${mode === 'personal' ? 'bg-pine text-white border-pine' : 'border-line'}`}
              >
                I have a personal code
              </button>
            </div>

            <form onSubmit={handleHouseholdSubmit} className="space-y-3">
              {mode === 'create' && (
                <input
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="Household name (e.g. The Smiths)"
                  className="w-full border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
                />
              )}
              {mode === 'join' && (
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Invite code"
                  required
                  className="w-full border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine uppercase"
                />
              )}
              {mode === 'personal' && (
                <>
                  <p className="text-xs text-ink/60">
                    Someone in your household already set up a spot for you - enter the code they gave you.
                  </p>
                  <input
                    value={personalCode}
                    onChange={(e) => setPersonalCode(e.target.value)}
                    placeholder="Personal code"
                    required
                    className="w-full border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine uppercase"
                  />
                </>
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

        {step === 'prefilled' && prefill && (
          <Card>
            <h1 className="font-display text-2xl mb-1">Welcome, {prefill.displayName}</h1>
            <p className="text-sm text-ink/60 mb-5">
              Your targets have already been set up for you:
            </p>
            <p className="font-mono text-sm bg-paper rounded-card p-3 mb-5">
              {prefill.calories} cal · {prefill.proteinG}g protein / {prefill.carbsG}g carbs / {prefill.fatG}g fat
            </p>
            {error && <p className="text-sm text-rust mb-3">{error}</p>}
            <div className="space-y-2">
              <Button onClick={acceptPrefilledMacros} disabled={prefillBusy} className="w-full">
                {prefillBusy ? 'Setting up…' : 'Use these targets & finish'}
              </Button>
              <button type="button" onClick={calculateInsteadOfPrefill} className="w-full text-sm text-ink/50 hover:underline py-1">
                Actually, let me calculate my own
              </button>
            </div>
          </Card>
        )}

        {step === 'details' && (
          <Card>
            <h1 className="font-display text-2xl mb-1">Your macro calculator</h1>
            <p className="text-sm text-ink/60 mb-5">
              Used to set your personal calorie and macro targets. You can recalculate any time
              from the Weight page.
            </p>
            <MacroCalculatorForm
              onSubmit={finishProfile}
              submitLabel="Calculate my targets & finish"
              units={units}
              initial={prefill?.displayName ? { display_name: prefill.displayName } : {}}
            />
          </Card>
        )}
      </div>
    </main>
  );
}
