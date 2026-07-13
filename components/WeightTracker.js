'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';

function WeightChart({ logs }) {
  if (logs.length < 2) {
    return <p className="text-sm text-ink/50 italic">Log a couple more entries to see a trend line.</p>;
  }

  const width = 560;
  const height = 160;
  const padding = 24;
  const weights = logs.map((l) => l.weight_lb);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;

  const points = logs.map((l, i) => {
    const x = padding + (i / (logs.length - 1)) * (width - padding * 2);
    const y = height - padding - ((l.weight_lb - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
      <polyline points={points.join(' ')} fill="none" stroke="#3F5C48" strokeWidth="2" />
      {logs.map((l, i) => {
        const [x, y] = points[i].split(',');
        return <circle key={i} cx={x} cy={y} r="3" fill="#C1502E" />;
      })}
    </svg>
  );
}

export default function WeightTracker({ profile, logs }) {
  const router = useRouter();
  const [weight, setWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const res = await fetch('/api/weight/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weightLb: Number(weight) }),
    });
    const data = await res.json();
    setSubmitting(false);
    setWeight('');

    if (data.recalculated) {
      setMessage(
        `Your weight moved 5 lb since your last calculation — targets updated to ${data.targets.calories} cal / ${data.targets.proteinG}p / ${data.targets.carbsG}c / ${data.targets.fatG}f.`
      );
    }
    router.refresh();
  }

  const latest = logs[logs.length - 1]?.weight_lb;
  const delta = latest != null && profile.baseline_weight_lb != null ? latest - profile.baseline_weight_lb : 0;

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-display text-xl mb-4">Log today&apos;s weight</h2>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="number"
            step="0.1"
            required
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="Weight (lb)"
            className="flex-1 border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Log weight'}
          </Button>
        </form>
        {message && (
          <p className="text-sm bg-gold/20 rounded-card p-3 mt-4">{message}</p>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">Trend</h2>
          <p className="text-sm text-ink/60 font-mono">
            {Math.abs(delta).toFixed(1)} lb {delta >= 0 ? 'up' : 'down'} since last recalc
          </p>
        </div>
        <WeightChart logs={logs} />
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl">Current targets</h2>
          <Link href="/recalculate" className="text-sm text-pine hover:underline">
            Redo the calculator →
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3 font-mono text-sm">
          <div>
            <p className="text-ink/50 text-xs">Calories</p>
            <p className="text-lg">{profile.target_calories}</p>
          </div>
          <div>
            <p className="text-ink/50 text-xs">Protein</p>
            <p className="text-lg">{profile.target_protein_g}g</p>
          </div>
          <div>
            <p className="text-ink/50 text-xs">Carbs</p>
            <p className="text-lg">{profile.target_carbs_g}g</p>
          </div>
          <div>
            <p className="text-ink/50 text-xs">Fat</p>
            <p className="text-lg">{profile.target_fat_g}g</p>
          </div>
        </div>
        <p className="text-xs text-ink/50 mt-4">
          Targets recalculate automatically whenever your weight moves 5 lb from{' '}
          {profile.baseline_weight_lb} lb (the weight they were last calculated against).
        </p>
      </Card>
    </div>
  );
}
