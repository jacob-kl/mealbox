import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { swapDay, DEFAULT_STRUCTURE_RULES } from '@/lib/weekBuilder';

export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { weekPlanId, dayIndex, cuisine = null } = await request.json();
  if (!weekPlanId || dayIndex == null) {
    return NextResponse.json({ error: 'weekPlanId and dayIndex are required' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single();
  const householdId = profile?.household_id;

  const { data: weekPlan } = await supabase
    .from('week_plans')
    .select('household_id')
    .eq('id', weekPlanId)
    .single();
  if (!weekPlan || weekPlan.household_id !== householdId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: household } = await supabase
    .from('households')
    .select('settings')
    .eq('id', householdId)
    .single();
  const structureRules = household?.settings?.structureRules || DEFAULT_STRUCTURE_RULES;
  const blockedTags = household?.settings?.blockedTags || [];
  const rule = structureRules.find((r) => r.dayIndex === dayIndex) || structureRules[dayIndex];

  const { data: currentDay } = await supabase
    .from('week_plan_days')
    .select('recipe_id')
    .eq('week_plan_id', weekPlanId)
    .eq('day_index', dayIndex)
    .single();

  const { data: members } = await supabase
    .from('profiles')
    .select('id, target_calories')
    .eq('household_id', householdId);

  const { data: recipePool } = await supabase
    .from('recipes')
    .select('*')
    .or(`household_id.is.null,household_id.eq.${householdId}`);

  const membersForBuilder = (members || []).map((m) => ({
    id: m.id,
    targetCalories: m.target_calories || 2000,
  }));

  const newDay = swapDay({
    recipePool: recipePool || [],
    rule,
    members: membersForBuilder,
    blockedTags,
    cuisine,
    excludeId: currentDay?.recipe_id,
  });

  const { error } = await supabase
    .from('week_plan_days')
    .update({
      recipe_id: newDay.recipeId,
      portions: newDay.portions,
      label: newDay.label,
    })
    .eq('week_plan_id', weekPlanId)
    .eq('day_index', dayIndex);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ day: newDay });
}
