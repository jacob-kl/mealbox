'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULT_DAYS = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };
const DEFAULT_STRATEGY = { 0: 'batch', 1: 'batch', 2: 'batch', 3: 'batch', 4: 'batch', 5: 'batch', 6: 'batch' };

/**
 * Each household member gets their own lunch schedule - which days they
 * have lunch at all, and whether each of those days is a batch-cooked
 * (same recipe reused) or freshly-cooked lunch. Tabs switch between people.
 */
export default function LunchScheduleEditor({ members, currentUserId, isHeadOfKitchen }) {
  const supabase = createClient();
  const [activeId, setActiveId] = useState(members[0]?.id);
  const [schedules, setSchedules] = useState(
    Object.fromEntries(
      members.map((m) => [
        m.id,
        {
          days: { ...DEFAULT_DAYS, ...(m.lunch_schedule?.days || {}) },
          strategy: { ...DEFAULT_STRATEGY, ...(m.lunch_schedule?.strategy || {}) },
        },
      ])
    )
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!members?.length) {
    return <p className="text-sm text-ink/50">No household members found yet.</p>;
  }

  const active = members.find((m) => m.id === activeId);
  const canEditActive = isHeadOfKitchen || activeId === currentUserId;
  const schedule = schedules[activeId] || { days: DEFAULT_DAYS, strategy: DEFAULT_STRATEGY };

  function toggleDay(dayIndex) {
    setSaved(false);
    setCopied(false);
    setSchedules((prev) => ({
      ...prev,
      [activeId]: { ...prev[activeId], days: { ...prev[activeId].days, [dayIndex]: !prev[activeId].days[dayIndex] } },
    }));
  }

  function toggleStrategy(dayIndex) {
    setSaved(false);
    setCopied(false);
    setSchedules((prev) => ({
      ...prev,
      [activeId]: {
        ...prev[activeId],
        strategy: { ...prev[activeId].strategy, [dayIndex]: prev[activeId].strategy[dayIndex] === 'batch' ? 'fresh' : 'batch' },
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    await supabase.from('profiles').update({ lunch_schedule: schedule }).eq('id', activeId);
    setSaving(false);
    setSaved(true);
  }

  async function copyToAll() {
    setCopying(true);
    setCopied(false);
    const others = members.filter((m) => m.id !== activeId);
    // Apply locally first so the UI reflects it immediately without waiting
    // on every request to round-trip.
    setSchedules((prev) => {
      const next = { ...prev };
      for (const m of others) next[m.id] = schedule;
      return next;
    });
    await Promise.all(others.map((m) => supabase.from('profiles').update({ lunch_schedule: schedule }).eq('id', m.id)));
    // The active person's own schedule should also be saved, since "copy to
    // everyone" implies this is now the household's shared schedule.
    await supabase.from('profiles').update({ lunch_schedule: schedule }).eq('id', activeId);
    setCopying(false);
    setCopied(true);
    setSaved(true);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setActiveId(m.id);
              setSaved(false);
              setCopied(false);
            }}
            className={`text-sm px-3 py-1.5 rounded-card border ${
              activeId === m.id ? 'bg-pine text-white border-pine' : 'border-line'
            }`}
          >
            {m.display_name}
          </button>
        ))}
      </div>

      {!canEditActive && (
        <p className="text-xs text-ink/50 mb-3">Only {active?.display_name} or the head chef can change this.</p>
      )}

      <div className="space-y-1.5">
        {DAY_NAMES.map((name, dayIndex) => {
          const enabled = !!schedule.days[dayIndex];
          const strategy = schedule.strategy[dayIndex] || 'batch';
          return (
            <div key={dayIndex} className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2 w-32 shrink-0">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleDay(dayIndex)}
                  disabled={!canEditActive}
                  className="w-4 h-4 accent-pine cursor-pointer disabled:cursor-not-allowed"
                />
                {name}
              </label>
              {enabled && (
                <button
                  type="button"
                  onClick={() => toggleStrategy(dayIndex)}
                  disabled={!canEditActive}
                  className={`text-xs px-3 py-1 rounded-card border disabled:cursor-not-allowed ${
                    strategy === 'fresh' ? 'bg-gold/30 border-gold' : 'border-line'
                  }`}
                >
                  {strategy === 'fresh' ? 'Fresh' : 'Batch'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canEditActive && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-card bg-pine text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved && !copied ? 'Saved ✓' : `Save ${active?.display_name}'s schedule`}
          </button>
          {isHeadOfKitchen && members.length > 1 && (
            <button
              type="button"
              onClick={copyToAll}
              disabled={copying}
              className="text-xs px-3 py-1.5 rounded-card border border-line hover:bg-paper disabled:opacity-50"
            >
              {copying ? 'Copying…' : copied ? 'Copied to everyone ✓' : `Copy ${active?.display_name}'s schedule to everyone`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
