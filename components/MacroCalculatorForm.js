'use client';

import { useState } from 'react';
import { calculateTargets, cmFromFeetInches, feetInchesFromCm, lbToKg, kgToLb, DIET_TYPES } from '@/lib/macros';

const COLORS = ['#3F5C48', '#C1502E', '#7A5AA8', '#3D7EA6', '#B8863B'];
const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: CURRENT_YEAR - 1900 + 1 }, (_, i) => CURRENT_YEAR - i);

/**
 * @param {Object} props
 * @param {Object} [props.initial] - existing profile values to prefill (for recalculation)
 * @param {(payload: {rawInputs, targets}) => void} props.onSubmit
 * @param {string} [props.submitLabel]
 * @param {boolean} [props.showNameAndColor]
 * @param {'imperial'|'metric'} [props.units] - household unit preference
 */
export default function MacroCalculatorForm({
  initial = {},
  onSubmit,
  submitLabel = 'Calculate my targets',
  showNameAndColor = true,
  units = 'imperial',
}) {
  const isMetric = units === 'metric';
  const initialHeight = feetInchesFromCm(initial.height_cm);
  const initialWeightLb = initial.baseline_weight_lb || '';

  const [displayName, setDisplayName] = useState(initial.display_name || '');
  const [color, setColor] = useState(initial.color || COLORS[0]);
  const [sex, setSex] = useState(initial.sex || 'male');
  const [birthYear, setBirthYear] = useState(String(initial.birth_year || 2000));
  const [feet, setFeet] = useState(initialHeight.feet || '');
  const [inches, setInches] = useState(initialHeight.inches || '');
  const [heightCmInput, setHeightCmInput] = useState(initial.height_cm ? String(Math.round(initial.height_cm)) : '');
  const [weightLb, setWeightLb] = useState(initialWeightLb ? String(initialWeightLb) : '');
  const [weightKgInput, setWeightKgInput] = useState(initialWeightLb ? String(Math.round(lbToKg(initialWeightLb))) : '');
  const [activityLevel, setActivityLevel] = useState(initial.activity_level || 'moderate');
  const [goal, setGoal] = useState(initial.goal || 'maintain');
  const [dietType, setDietType] = useState(initial.diet_type || 'balanced');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const heightCm = isMetric ? Number(heightCmInput) || 0 : cmFromFeetInches(Number(feet) || 0, Number(inches) || 0);
      const weightLbValue = isMetric ? kgToLb(Number(weightKgInput) || 0) : Number(weightLb);
      const age = new Date().getFullYear() - Number(birthYear);
      const targets = calculateTargets({
        sex,
        age,
        heightCm,
        weightLb: weightLbValue,
        activityLevel,
        goal,
        dietType,
      });

      await onSubmit({
        rawInputs: {
          display_name: displayName || 'Household member',
          color,
          sex,
          birth_year: Number(birthYear),
          height_cm: heightCm,
          activity_level: activityLevel,
          goal,
          diet_type: dietType,
          baseline_weight_lb: Math.round(weightLbValue * 10) / 10,
        },
        targets,
      });
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showNameAndColor && (
        <>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            required
            className="w-full border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
          />
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`}
                aria-label={`Choose color ${c}`}
              />
            ))}
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <select
          value={sex}
          onChange={(e) => setSex(e.target.value)}
          className="border border-line rounded-card px-3 py-2.5 bg-card"
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <select
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
          required
          className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
        >
          {BIRTH_YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {isMetric ? (
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            value={heightCmInput}
            onChange={(e) => setHeightCmInput(e.target.value)}
            placeholder="Height (cm)"
            required
            className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
          />
          <input
            type="number"
            value={weightKgInput}
            onChange={(e) => setWeightKgInput(e.target.value)}
            placeholder="Weight (kg)"
            required
            className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <input
            type="number"
            value={feet}
            onChange={(e) => setFeet(e.target.value)}
            placeholder="Height (ft)"
            required
            className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
          />
          <input
            type="number"
            value={inches}
            onChange={(e) => setInches(e.target.value)}
            placeholder="(in)"
            className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
          />
          <input
            type="number"
            value={weightLb}
            onChange={(e) => setWeightLb(e.target.value)}
            placeholder="Weight (lb)"
            required
            className="border border-line rounded-card px-3 py-2.5 bg-card outline-none focus:border-pine"
          />
        </div>
      )}

      <div>
        <label className="text-sm text-ink/60 block mb-1">Activity level</label>
        <select
          value={activityLevel}
          onChange={(e) => setActivityLevel(e.target.value)}
          className="w-full border border-line rounded-card px-3 py-2.5 bg-card"
        >
          <option value="sedentary">Sedentary — little to no exercise</option>
          <option value="light">Light — 1-3 days/week</option>
          <option value="moderate">Moderate — 3-5 days/week</option>
          <option value="active">Active — 6-7 days/week</option>
          <option value="very_active">Very active — hard training + physical job</option>
        </select>
      </div>

      <div>
        <label className="text-sm text-ink/60 block mb-1">Goal</label>
        <select
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className="w-full border border-line rounded-card px-3 py-2.5 bg-card"
        >
          <option value="cut">Cut — lose fat</option>
          <option value="maintain">Maintain</option>
          <option value="bulk">Bulk — gain</option>
        </select>
      </div>

      <div>
        <label className="text-sm text-ink/60 block mb-1">Diet style</label>
        <select
          value={dietType}
          onChange={(e) => setDietType(e.target.value)}
          className="w-full border border-line rounded-card px-3 py-2.5 bg-card"
        >
          {Object.entries(DIET_TYPES).map(([key, d]) => (
            <option key={key} value={key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-pine text-white rounded-card py-2.5 font-medium hover:bg-pineDark transition-colors disabled:opacity-50"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
