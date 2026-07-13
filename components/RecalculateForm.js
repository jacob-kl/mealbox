'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import MacroCalculatorForm from '@/components/MacroCalculatorForm';

export default function RecalculateForm({ profile, units = 'imperial' }) {
  const supabase = createClient();
  const router = useRouter();

  async function handleSubmit({ rawInputs, targets }) {
    const { error } = await supabase
      .from('profiles')
      .update({
        ...rawInputs,
        target_calories: targets.calories,
        target_protein_g: targets.proteinG,
        target_carbs_g: targets.carbsG,
        target_fat_g: targets.fatG,
        needs_recalc: false,
      })
      .eq('id', profile.id);

    if (error) throw new Error(error.message);

    router.push('/weight');
    router.refresh();
  }

  return (
    <MacroCalculatorForm
      initial={profile}
      onSubmit={handleSubmit}
      submitLabel="Save updated targets"
      showNameAndColor={true}
      units={units}
    />
  );
}
