'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui';
import PackCircle from '@/components/PackCircle';
import { addDays } from '@/lib/dates';
import { buildShoppingList, CATEGORY_ORDER } from '@/lib/shoppingList';
import { formatQty } from '@/lib/nutrition';

export default function ShoppingList({ weekStart, weekPlanId, meals, checks }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(null);

  const list = useMemo(() => buildShoppingList(meals), [meals]);

  const checkMap = useMemo(() => {
    const map = {};
    for (const c of checks) map[c.ingredient_name] = c;
    return map;
  }, [checks]);

  function isDone(item) {
    const check = checkMap[item.ingredient];
    if (!check) return false;
    if (item.packCount) return (check.checked_count || 0) >= item.packCount;
    return !!check.checked;
  }

  async function saveCheck(ingredientName, patch) {
    setBusy(ingredientName);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from('shopping_list_checks').upsert(
      { week_plan_id: weekPlanId, ingredient_name: ingredientName, checked_by: user.id, ...patch },
      { onConflict: 'week_plan_id,ingredient_name' }
    );
    setBusy(null);
    router.refresh();
  }

  async function togglePlain(item) {
    if (!weekPlanId) return;
    await saveCheck(item.ingredient, { checked: !isDone(item) });
  }

  async function incrementPack(item) {
    if (!weekPlanId) return;
    const current = checkMap[item.ingredient]?.checked_count || 0;
    // Click through 0 -> 1 -> ... -> total, then wraps back to 0.
    const next = current >= item.packCount ? 0 : current + 1;
    await saveCheck(item.ingredient, { checked_count: next, checked: next >= item.packCount });
  }

  const grouped = useMemo(() => {
    const byCategory = {};
    for (const item of list) {
      byCategory[item.category] = byCategory[item.category] || [];
      byCategory[item.category].push(item);
    }
    return byCategory;
  }, [list]);

  const remainingCount = list.filter((i) => !isDone(i)).length;

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
        <div className="space-y-6">
          <p className="text-sm text-ink/50">{remainingCount} item{remainingCount === 1 ? '' : 's'} left to get</p>
          {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((category) => (
            <Card key={category}>
              <p className="tab-label text-rust mb-3">{category}</p>
              <div className="space-y-1">
                {grouped[category].map((item) => {
                  const done = isDone(item);
                  return (
                    <div
                      key={item.ingredient}
                      className={`flex items-center gap-3 py-1.5 ${done ? 'opacity-50' : ''}`}
                    >
                      {item.packCount ? (
                        <PackCircle
                          filled={Math.min(checkMap[item.ingredient]?.checked_count || 0, item.packCount)}
                          total={item.packCount}
                          onClick={() => incrementPack(item)}
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={done}
                          disabled={busy === item.ingredient}
                          onChange={() => togglePlain(item)}
                          className="w-5 h-5 accent-pine cursor-pointer"
                        />
                      )}
                      <span className={`text-sm ${done ? 'line-through' : ''}`}>
                        {item.packCount ? (
                          <>
                            {item.ingredient} <span className="text-ink/50">({item.packLabel})</span>
                          </>
                        ) : (
                          <>
                            <span className="font-mono text-ink/70">{formatQty(item.qty, item.unit)}</span>{' '}
                            {item.ingredient}
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
