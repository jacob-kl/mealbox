import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateTargets, shouldRecalculate } from '@/lib/macros';

const RECALC_THRESHOLD_LB = 5;

export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { weightLb } = await request.json();
  if (!weightLb || Number.isNaN(Number(weightLb))) {
    return NextResponse.json({ error: 'weightLb is required' }, { status: 400 });
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const { error: logError } = await supabase
    .from('weight_logs')
    .insert({ profile_id: user.id, weight_lb: Number(weightLb) });
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

  const triggered = shouldRecalculate(profile.baseline_weight_lb, Number(weightLb), RECALC_THRESHOLD_LB);

  let updatedTargets = null;
  if (triggered) {
    const age = new Date().getFullYear() - profile.birth_year;
    const targets = calculateTargets({
      sex: profile.sex,
      age,
      heightCm: profile.height_cm,
      weightLb: Number(weightLb),
      activityLevel: profile.activity_level,
      goal: profile.goal,
    });

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        baseline_weight_lb: Number(weightLb),
        target_calories: targets.calories,
        target_protein_g: targets.proteinG,
        target_carbs_g: targets.carbsG,
        target_fat_g: targets.fatG,
        needs_recalc: false,
      })
      .eq('id', user.id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    updatedTargets = targets;
  }

  return NextResponse.json({ recalculated: triggered, targets: updatedTargets });
}
