'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const supabase = createClient();

  async function signInWithGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  async function signInWithEmail(e) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="index-card w-full max-w-sm p-8">
        <p className="tab-label text-rust mb-2">Mealbox</p>
        <h1 className="font-display text-3xl mb-1">Sign in</h1>
        <p className="text-sm text-ink/60 mb-6">
          Plan meals and macros for your whole household.
        </p>

        <button
          onClick={signInWithGoogle}
          className="w-full border border-line rounded-card py-2.5 font-medium hover:bg-paper transition-colors mb-4"
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-4 text-xs text-ink/40">
          <div className="h-px bg-line flex-1" />
          or
          <div className="h-px bg-line flex-1" />
        </div>

        {sent ? (
          <p className="text-sm bg-pine/10 text-pineDark rounded-card p-3">
            Check <strong>{email}</strong> for a sign-in link.
          </p>
        ) : (
          <form onSubmit={signInWithEmail} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
            />
            <button
              type="submit"
              className="w-full bg-pine text-white rounded-card py-2.5 font-medium hover:bg-pineDark transition-colors"
            >
              Email me a sign-in link
            </button>
          </form>
        )}

        {error && <p className="text-sm text-rust mt-4">{error}</p>}
      </div>
    </main>
  );
}
