import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Looks up a personal invite code and issues a fresh one-time password for
// the placeholder account, so the client can sign in as that exact profile
// with a single standard signInWithPassword call - no magic links or token
// verification involved, just the most ordinary Supabase auth method there
// is. The client is expected to immediately follow up by setting a real
// email/password once signed in.
export async function POST(request) {
  const { code } = await request.json();
  if (!code?.trim()) return NextResponse.json({ error: 'A code is required.' }, { status: 400 });

  const admin = createAdminClient();

  const { data: profileRow, error: lookupError } = await admin
    .from('profiles')
    .select('id, household_id, display_name, target_calories, target_protein_g, target_carbs_g, target_fat_g, is_placeholder')
    .eq('personal_invite_code', code.trim().toUpperCase())
    .single();

  if (lookupError || !profileRow) {
    return NextResponse.json({ error: 'No invite found with that code.' }, { status: 404 });
  }
  if (!profileRow.is_placeholder) {
    return NextResponse.json({ error: 'This spot has already been claimed.' }, { status: 400 });
  }

  const { data: authUser, error: getUserError } = await admin.auth.admin.getUserById(profileRow.id);
  if (getUserError || !authUser) {
    return NextResponse.json({ error: 'Could not find the account for this invite.' }, { status: 500 });
  }

  const oneTimePassword = crypto.randomUUID();
  const { error: updateError } = await admin.auth.admin.updateUserById(profileRow.id, {
    password: oneTimePassword,
  });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    placeholderEmail: authUser.user.email,
    oneTimePassword,
    displayName: profileRow.display_name,
    householdId: profileRow.household_id,
    hasPrefillMacros: !!profileRow.target_calories,
    prefill: {
      calories: profileRow.target_calories,
      proteinG: profileRow.target_protein_g,
      carbsG: profileRow.target_carbs_g,
      fatG: profileRow.target_fat_g,
    },
  });
}
