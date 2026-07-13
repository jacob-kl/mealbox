'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, Button, CUISINES, cuisineLabel } from '@/components/ui';
import { computeRecipeMacros } from '@/lib/nutrition';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'sauce', 'dessert'];
const COURSES = [
  { value: 'complete', label: 'Complete meal (protein + sides in one)' },
  { value: 'main', label: 'Main (mix and match with a side)' },
  { value: 'side', label: 'Side (mix and match with a main)' },
];

function emptyIngredientLine() {
  return { ingredient: '', qty: '', note: '' };
}

export default function RecipeForm({ householdId, ingredients }) {
  const supabase = createClient();
  const router = useRouter();

  const [name, setName] = useState('');
  const [cuisine, setCuisine] = useState('american');
  const [mealType, setMealType] = useState('dinner');
  const [course, setCourse] = useState('complete');
  const [tagsInput, setTagsInput] = useState('');
  const [baseServings, setBaseServings] = useState('1');
  const [ingredientLines, setIngredientLines] = useState([emptyIngredientLine()]);
  const [steps, setSteps] = useState(['']);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const ingredientsByName = Object.fromEntries(ingredients.map((i) => [i.name, i]));

  function updateLine(index, patch) {
    setIngredientLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setIngredientLines((prev) => [...prev, emptyIngredientLine()]);
  }

  function removeLine(index) {
    setIngredientLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStep(index, value) {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, '']);
  }

  function removeStep(index) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const cleanedLines = ingredientLines
      .filter((l) => l.ingredient && l.qty !== '')
      .map((l) => ({
        ingredient: l.ingredient,
        qty: Number(l.qty),
        note: l.note || undefined,
        unit: ingredientsByName[l.ingredient]?.serving_unit || null,
      }));

    if (!name.trim()) return setError('Give the recipe a name.');
    if (cleanedLines.length === 0) return setError('Add at least one ingredient.');

    setSubmitting(true);
    try {
      const macros = computeRecipeMacros(cleanedLines, ingredientsByName, Number(baseServings) || 1);

      const tags = tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const { error: insertError } = await supabase.from('recipes').insert({
        household_id: householdId,
        name: name.trim(),
        cuisine,
        meal_type: mealType,
        course,
        tags,
        base_servings: Number(baseServings) || 1,
        ingredients: cleanedLines,
        steps: steps.map((s) => s.trim()).filter(Boolean),
        macros_per_serving: macros,
      });

      if (insertError) throw new Error(insertError.message);

      router.push('/recipes');
      router.refresh();
    } catch (err) {
      setError(err.message || 'Something went wrong computing or saving this recipe.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Recipe name"
          required
          className="w-full border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
        />

        <div className="grid grid-cols-2 gap-3">
          <select
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            className="border border-line rounded-card px-3 py-2.5 bg-card"
          >
            {CUISINES.map((c) => (
              <option key={c} value={c}>
                {cuisineLabel(c)}
              </option>
            ))}
          </select>
          <select
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
            className="border border-line rounded-card px-3 py-2.5 bg-card capitalize"
          >
            {MEAL_TYPES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm text-ink/60 block mb-1">Course</label>
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            className="w-full border border-line rounded-card px-3 py-2.5 bg-card"
          >
            {COURSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Tags, comma separated (e.g. fish, cold-friendly)"
            className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
          />
          <input
            type="number"
            step="0.5"
            value={baseServings}
            onChange={(e) => setBaseServings(e.target.value)}
            placeholder="Servings this recipe makes"
            className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
          />
        </div>

        <div>
          <label className="text-sm text-ink/60 block mb-2">Ingredients</label>
          <datalist id="ingredient-options">
            {ingredients.map((i) => (
              <option key={i.name} value={i.name} />
            ))}
          </datalist>
          <div className="space-y-2">
            {ingredientLines.map((line, i) => {
              const known = ingredientsByName[line.ingredient];
              return (
                <div key={i} className="flex gap-2 items-start">
                  <input
                    list="ingredient-options"
                    value={line.ingredient}
                    onChange={(e) => updateLine(i, { ingredient: e.target.value })}
                    placeholder="Ingredient"
                    className="flex-[2] border border-line rounded-card px-2 py-2 bg-card text-sm"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={line.qty}
                    onChange={(e) => updateLine(i, { qty: e.target.value })}
                    placeholder={known ? known.serving_unit || 'qty' : 'qty'}
                    className="flex-1 border border-line rounded-card px-2 py-2 bg-card text-sm"
                  />
                  <input
                    value={line.note}
                    onChange={(e) => updateLine(i, { note: e.target.value })}
                    placeholder="Note (optional)"
                    className="flex-[2] border border-line rounded-card px-2 py-2 bg-card text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="text-rust text-sm px-2 py-2"
                    aria-label="Remove ingredient"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addLine} className="text-sm text-pine hover:underline mt-2">
            + Add ingredient
          </button>
          <p className="text-xs text-ink/40 mt-1">
            Ingredient must match an existing name from the database (start typing to see matches). Need
            a new ingredient added? Just ask.
          </p>
        </div>

        <div>
          <label className="text-sm text-ink/60 block mb-2">Steps</label>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-sm text-ink/40 pt-2 w-5">{i + 1}.</span>
                <textarea
                  value={s}
                  onChange={(e) => updateStep(i, e.target.value)}
                  rows={2}
                  className="flex-1 border border-line rounded-card px-2 py-2 bg-card text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="text-rust text-sm px-2 py-2"
                  aria-label="Remove step"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addStep} className="text-sm text-pine hover:underline mt-2">
            + Add step
          </button>
        </div>

        {error && <p className="text-sm text-rust">{error}</p>}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Saving…' : 'Save recipe'}
        </Button>
      </form>
    </Card>
  );
}
