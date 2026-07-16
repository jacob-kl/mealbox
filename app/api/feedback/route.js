import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Feedback always gets saved to the database first, so nothing is ever lost
// even if email sending isn't set up. If RESEND_API_KEY is configured, this
// also attempts to email it directly - but a failure there doesn't fail the
// request, since the submission is already safely stored either way.
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { message } = await request.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: 'Feedback message is required.' }, { status: 400 });
  }

  let householdId = null;
  let profileId = null;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single();
    householdId = profile?.household_id || null;
    profileId = user.id;
  }

  const { error: insertError } = await supabase.from('feedback').insert({
    household_id: householdId,
    profile_id: profileId,
    message: message.trim(),
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Best-effort email delivery - never surfaced to the sender if it fails,
  // and never blocks the response, since the feedback is already saved.
  const resendKey = process.env.RESEND_API_KEY;
  const feedbackToEmail = process.env.FEEDBACK_TO_EMAIL;
  if (resendKey && feedbackToEmail) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Mealbox Feedback <feedback@resend.dev>',
          to: feedbackToEmail,
          subject: 'New Mealbox feedback',
          text: message.trim(),
        }),
      });
    } catch {
      // Swallow - the submission is already safely in the database.
    }
  }

  return NextResponse.json({ ok: true });
}
