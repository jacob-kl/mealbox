import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomInviteCode } from '@/lib/inviteCode';

// Creates a real profile immediately (so it counts in meal planning right
// away), backed by a placeholder auth account nobody needs to check email
// for. The head of kitchen shares the returned personal code so the real
// person can claim the account later - swapping in their own email/password
// without losing anything already planned for them.
export async function POST(request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: requester, error: requesterError } = await supabase
      .from('profiles')
      .select('household_id, household_role')
      .eq('id', user.id)
      .single();

    if (requesterError) {
      console.error('[add-member] failed to load requester profile:', requesterError);
      return NextResponse.json({ error: `Couldn't load your profile: ${requesterError.message}` }, { status: 500 });
    }

    if (requester?.household_role !== 'head_of_kitchen') {
      console.error('[add-member] rejected - requester role is', requester?.household_role);
      return NextResponse.json({ error: 'Only the head chef can add household members.' }, { status: 403 });
    }
    const householdId = requester.household_id;

    const { displayName, targetCalories, targetProteinG, targetCarbsG, targetFatG } = await request.json();
    if (!displayName?.trim()) {
      return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
    }

    let admin;
    try {
      admin = createAdminClient();
    } catch (err) {
      console.error('[add-member] createAdminClient failed:', err.message);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const placeholderEmail = `member-${crypto.randomUUID()}@mealbox.placeholder`;
    const placeholderPassword = crypto.randomUUID();
    const personalInviteCode = randomInviteCode();

    console.log('[add-member] creating placeholder auth user for', displayName.trim());
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: placeholderEmail,
      password: placeholderPassword,
      email_confirm: true,
    });
    if (createError) {
      console.error('[add-member] createUser failed:', createError);
      return NextResponse.json({ error: `Couldn't create their account: ${createError.message}` }, { status: 500 });
    }
    console.log('[add-member] auth user created:', created.user.id);

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id,
      household_id: householdId,
      household_role: 'member',
      display_name: displayName.trim(),
      target_calories: targetCalories || null,
      target_protein_g: targetProteinG || null,
      target_carbs_g: targetCarbsG || null,
      target_fat_g: targetFatG || null,
      needs_recalc: !targetCalories,
      onboarded: true,
      personal_invite_code: personalInviteCode,
      is_placeholder: true,
    });

    if (profileError) {
      console.error('[add-member] profile insert failed:', profileError);
      // Clean up the orphaned auth user if the profile insert failed, so we
      // don't leave a half-created member behind.
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: `Couldn't save their profile: ${profileError.message}` }, { status: 500 });
    }

    console.log('[add-member] success - profile created for', created.user.id);
    return NextResponse.json({ personalInviteCode });
  } catch (err) {
    console.error('[add-member] unexpected error:', err);
    return NextResponse.json({ error: `Unexpected error: ${err.message}` }, { status: 500 });
  }
}
