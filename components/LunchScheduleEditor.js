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

  const active = members.find((m) => m.id === activeId);
  const canEditActive = isHeadOfKitchen || activeId === currentUserId;
  const schedule = schedules[activeId];

  function toggleDay(dayIndex) {
    setSaved(false);
    setSchedules((prev) => ({
      ...prev,
      [activeId]: { ...prev[activeId], days: { ...prev[activeId].days, [dayIndex]: !prev[activeId].days[dayIndex] } },
    }));
  }

  function toggleStrategy(dayIndex) {
    setSaved(false);
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
        <p className="text-xs text-ink/50 mb-3">Only {active?.display_name} or the head of kitchen can change this.</p>
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
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-3 text-xs px-3 py-1.5 rounded-card bg-pine text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : `Save ${active?.display_name}'s schedule`}
        </button>
      )}
    </div>
  );
}
