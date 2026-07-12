'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { calculateTargets, cmFromFeetInches } from '@/lib/macros';
import { Card, Button } from '@/components/ui';

const COLORS = ['#3F5C48', '#C1502E', '#7A5AA8', '#3D7EA6', '#B8863B'];

function randomInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function OnboardingPage() {
  const supabase = createClient();
  const router = useRouter();

  const [step, setStep] = useState('household'); // household -> details -> saving
  const [mode, setMode] = useState('create'); // create | join
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState(null);
  const [householdId, setHouseholdId] = useState(null);
  const [createdInviteCode, setCreatedInviteCode] = useState(null);

  const [displayName, setDisplayName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [sex, setSex] = useState('male');
  const [birthYear, setBirthYear] = useState('');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [weightLb, setWeightLb] = useState('');
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [goal, setGoal] = useState('maintain');

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
      const { data, error } = await supabase
        .from('households')
        .select('id')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .maybeSingle();
      if (error || !data) return setError('No household found with that invite code.');
      setHouseholdId(data.id);
    }
    setStep('details');
  }

  async function handleDetailsSubmit(e) {
    e.preventDefault();
    setError(null);
    setStep('saving');

    const heightCm = cmFromFeetInches(Number(feet) || 0, Number(inches) || 0);
    const age = new Date().getFullYear() - Number(birthYear);
    const targets = calculateTargets({
      sex,
      age,
      heightCm,
      weightLb: Number(weightLb),
      activityLevel,
      goal,
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      household_id: householdId,
      display_name: displayName || 'Household member',
      color,
      sex,
      birth_year: Number(birthYear),
      height_cm: heightCm,
      activity_level: activityLevel,
      goal,
      baseline_weight_lb: Number(weightLb),
      target_calories: targets.calories,
      target_protein_g: targets.proteinG,
      target_carbs_g: targets.carbsG,
      target_fat_g: targets.fatG,
      needs_recalc: false,
      onboarded: true,
    });

    if (profileError) {
      setError(profileError.message);
      setStep('details');
      return;
    }

    await supabase.from('weight_logs').insert({ profile_id: user.id, weight_lb: Number(weightLb) });

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

        {(step === 'details' || step === 'saving') && (
          <Card>
            <h1 className="font-display text-2xl mb-1">Your macro calculator</h1>
            <p className="text-sm text-ink/60 mb-5">
              Used to set your personal calorie and macro targets. You can recalculate any time.
            </p>
            <form onSubmit={handleDetailsSubmit} className="space-y-4">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
                className="w-full border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
              />

              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`}
                    aria-label={`Choose color ${c}`}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                  className="border border-line rounded-card px-3 py-2.5 bg-card"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <input
                  type="number"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="Birth year"
                  required
                  className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <input
                  type="number"
                  value={feet}
                  onChange={(e) => setFeet(e.target.value)}
                  placeholder="Height (ft)"
                  required
                  className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
                />
                <input
                  type="number"
                  value={inches}
                  onChange={(e) => setInches(e.target.value)}
                  placeholder="(in)"
                  className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
                />
                <input
                  type="number"
                  value={weightLb}
                  onChange={(e) => setWeightLb(e.target.value)}
                  placeholder="Weight (lb)"
                  required
                  className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
                />
              </div>

              <div>
                <label className="text-sm text-ink/60 block mb-1">Activity level</label>
                <select
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value)}
                  className="w-full border border-line rounded-card px-3 py-2.5 bg-card"
                >
                  <option value="sedentary">Sedentary — little to no exercise</option>
                  <option value="light">Light — 1-3 days/week</option>
                  <option value="moderate">Moderate — 3-5 days/week</option>
                  <option value="active">Active — 6-7 days/week</option>
                  <option value="very_active">Very active — hard training + physical job</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-ink/60 block mb-1">Goal</label>
                <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full border border-line rounded-card px-3 py-2.5 bg-card"
                >
                  <option value="cut">Cut — lose fat</option>
                  <option value="maintain">Maintain</option>
                  <option value="bulk">Bulk — gain</option>
                </select>
              </div>

              {error && <p className="text-sm text-rust">{error}</p>}

              <Button type="submit" disabled={step === 'saving'} className="w-full">
                {step === 'saving' ? 'Saving…' : 'Calculate my targets & finish'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
