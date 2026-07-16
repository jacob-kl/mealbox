'use client';

import { useState } from 'react';
import { Card } from '@/components/ui';

// Fill in your real Venmo handle here (without the @) before deploying.
const VENMO_HANDLE = 'your-venmo-handle';

export default function SupportForm() {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setMessage('');
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-display text-xl mb-2">Keep the stove on</h2>
        <p className="text-sm text-ink/70 mb-4 leading-relaxed">
          Mealbox is a one-person kitchen operation — built, tested, and kept running by someone
          who'd rather spend an evening fixing a recipe's macros than watching TV. There's no ad
          in here, no upsell, no tier that unlocks the good ingredients. If Mealbox has earned a
          spot in your weekly routine and you'd like to toss a few dollars toward server bills,
          late-night debugging snacks, or just general kitchen upkeep, it's genuinely appreciated
          — and entirely optional either way.
        </p>
        <a
          href={`https://venmo.com/${VENMO_HANDLE}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm px-4 py-2 rounded-card bg-pine text-white hover:opacity-90"
        >
          Send something via Venmo →
        </a>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Feedback</h2>
        <p className="text-sm text-ink/60 mb-4">
          Bug, idea, or just a "this recipe was great" — this goes straight to Mealbox's builder.
          No email required, and nothing here is visible to other people using the app.
        </p>
        {sent ? (
          <p className="text-sm text-pine">Sent — thank you!</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's on your mind?"
              required
              rows={5}
              className="w-full border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine resize-none"
            />
            {error && <p className="text-sm text-rust">{error}</p>}
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="text-sm px-4 py-2 rounded-card bg-pine text-white disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send feedback'}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
