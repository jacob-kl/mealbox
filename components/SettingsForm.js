'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, Button, MACRO_LABELS, CUISINES } from '@/components/ui';
import { DEFAULT_STRUCTURE_RULES } from '@/lib/weekBuilder';
import { DAY_NAMES } from '@/lib/dates';

const BLOCKABLE_TAGS = [
  { tag: 'fish', label: 'Fish' },
  { tag: 'shellfish', label: 'Shellfish' },
  { tag: 'mushroom', label: 'Mushroom' },
  { tag: 'raw-onion', label: 'Raw onion' },
  { tag: 'lentil', label: 'Lentils' },
  { tag: 'okra', label: 'Okra' },
  { tag: 'eggplant', label: 'Eggplant' },
];

const MEAL_TYPES = ['dinner', 'breakfast'];
const THEME_TAGS = [
  { tag: '', label: 'No theme' },
  { tag: 'leftovers-friendly', label: 'Leftovers night' },
  { tag: 'no-cook', label: 'No-cook / cold night' },
];

export default function SettingsForm({ household, members }) {
  const supabase = createClient();
  const router = useRouter();

  const [blockedTags, setBlockedTags] = useState(household.settings?.blockedTags || []);
  const [structureRules, setStructureRules] = useState(
    household.settings?.structureRules || DEFAULT_STRUCTURE_RULES
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleTag(tag) {
    setBlockedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function updateRule(dayIndex, patch) {
    setStructureRules((prev) =>
      prev.map((r) => (r.dayIndex === dayIndex ? { ...r, ...patch } : r))
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from('households')
      .update({ settings: { ...household.settings, blockedTags, structureRules } })
      .eq('id', household.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-display text-xl mb-1">Invite people</h2>
        <p className="text-sm text-ink/60 mb-3">
          Share this code so others can join <strong>{household.name}</strong>.
        </p>
        <p className="font-mono text-2xl tracking-widest bg-paper border border-line rounded-card px-4 py-2 inline-block">
          {household.invite_code}
        </p>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-3">Household members</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm border-b border-line last:border-0 pb-2 last:pb-0">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: m.color }} />
                {m.display_name}
                <span className="text-xs text-ink/40 capitalize">({m.goal})</span>
              </span>
              <span className="font-mono text-xs text-ink/70">
                {m.target_calories} cal · {m.target_protein_g}p / {m.target_carbs_g}c / {m.target_fat_g}f
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Dietary exclusions</h2>
        <p className="text-sm text-ink/60 mb-3">
          Recipes tagged with these are never auto-selected for your household.
        </p>
        <div className="flex flex-wrap gap-2">
          {BLOCKABLE_TAGS.map(({ tag, label }) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`text-sm px-3 py-1.5 rounded-card border ${
                blockedTags.includes(tag) ? 'bg-rust text-white border-rust' : 'border-line'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Weekly structure</h2>
        <p className="text-sm text-ink/60 mb-4">
          Set a meal type and optional theme for each night — the auto-builder respects these.
        </p>
        <div className="space-y-2">
          {structureRules.map((rule) => (
            <div key={rule.dayIndex} className="grid grid-cols-3 gap-2 items-center text-sm">
              <span className="font-medium">{DAY_NAMES[rule.dayIndex]}</span>
              <select
                value={rule.mealType}
                onChange={(e) => updateRule(rule.dayIndex, { mealType: e.target.value })}
                className="border border-line rounded-card px-2 py-1.5 bg-card capitalize"
              >
                {MEAL_TYPES.map((mt) => (
                  <option key={mt} value={mt}>
                    {mt}
                  </option>
                ))}
              </select>
              <select
                value={rule.requiredTag || ''}
                onChange={(e) =>
                  updateRule(rule.dayIndex, {
                    requiredTag: e.target.value || null,
                    label: THEME_TAGS.find((t) => t.tag === e.target.value)?.label !== 'No theme'
                      ? THEME_TAGS.find((t) => t.tag === e.target.value)?.label
                      : null,
                  })
                }
                className="border border-line rounded-card px-2 py-1.5 bg-card"
              >
                {THEME_TAGS.map((t) => (
                  <option key={t.tag} value={t.tag}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
        {saved && <span className="text-sm text-pine">Saved.</span>}
      </div>
    </div>
  );
}
