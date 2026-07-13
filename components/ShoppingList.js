'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui';
import { addDays } from '@/lib/dates';
import { buildShoppingList } from '@/lib/shoppingList';
import { formatQty } from '@/lib/nutrition';

export default function ShoppingList({ weekStart, weekPlanId, meals, checks }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(null);

  const list = useMemo(() => buildShoppingList(meals), [meals]);
  const checkedSet = useMemo(
    () => new Set(checks.filter((c) => c.checked).map((c) => c.ingredient_name)),
    [checks]
  );

  async function toggle(ingredientName) {
    if (!weekPlanId) return;
    setBusy(ingredientName);
    const nowChecked = !checkedSet.has(ingredientName);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('shopping_list_checks').upsert(
      {
        week_plan_id: weekPlanId,
        ingredient_name: ingredientName,
        checked: nowChecked,
        checked_by: user.id,
      },
      { onConflict: 'week_plan_id,ingredient_name' }
    );
    setBusy(null);
    router.refresh();
  }

  const remaining = list.filter((i) => !checkedSet.has(i.ingredient));
  const done = list.filter((i) => checkedSet.has(i.ingredient));

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link href={`/shopping?week=${addDays(weekStart, -7)}`} className="text-sm text-pine hover:underline">
          ← Prev week
        </Link>
        <div className="text-center">
          <p className="tab-label text-rust mb-1">Shopping list</p>
          <h1 className="font-display text-2xl">Week of {weekStart}</h1>
        </div>
        <Link href={`/shopping?week=${addDays(weekStart, 7)}`} className="text-sm text-pine hover:underline">
          Next week →
        </Link>
      </div>

      {!weekPlanId ? (
        <Card>
          <p className="text-ink/70">
            No plan built for this week yet.{' '}
            <Link href={`/week?week=${weekStart}`} className="text-pine hover:underline">
              Build it
            </Link>{' '}
            first and the shopping list will fill in automatically.
          </p>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <p className="text-ink/70">Nothing planned that needs shopping for.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <p className="tab-label text-ink/50 mb-3">To buy ({remaining.length})</p>
            <div className="space-y-1">
              {remaining.map((item) => (
                <label key={item.ingredient} className="flex items-center gap-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={busy === item.ingredient}
                    onChange={() => toggle(item.ingredient)}
                    className="w-5 h-5 accent-pine"
                  />
                  <span className="text-sm">
                    <span className="font-mono text-ink/70">{formatQty(item.qty, item.unit)}</span>{' '}
                    {item.ingredient}
                  </span>
                </label>
              ))}
              {remaining.length === 0 && <p className="text-sm text-ink/50 italic">Everything&apos;s checked off.</p>}
            </div>
          </Card>

          {done.length > 0 && (
            <Card>
              <p className="tab-label text-ink/50 mb-3">Got it ({done.length})</p>
              <div className="space-y-1">
                {done.map((item) => (
                  <label key={item.ingredient} className="flex items-center gap-3 py-1.5 cursor-pointer opacity-50">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled={busy === item.ingredient}
                      onChange={() => toggle(item.ingredient)}
                      className="w-5 h-5 accent-pine"
                    />
                    <span className="text-sm line-through">
                      <span className="font-mono text-ink/70">{formatQty(item.qty, item.unit)}</span>{' '}
                      {item.ingredient}
                    </span>
                  </label>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
