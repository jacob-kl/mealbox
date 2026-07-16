'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Yum/yuck voting on a planned meal. Anyone in the household can react,
 * regardless of whether they can edit the plan - voting is how a member
 * without edit access still gets a voice: enough yucks is the signal for
 * whoever CAN edit (head chef/sous chef) to swap it out.
 *
 * @param {{profile_id: string, reaction: 'yum'|'yuck'}[]} reactions
 */
export default function MealReactions({ weekPlanMealId, reactions = [], currentUserId }) {
  const supabase = createClient();
  const [localReactions, setLocalReactions] = useState(reactions);
  const [busy, setBusy] = useState(false);

  const yumCount = localReactions.filter((r) => r.reaction === 'yum').length;
  const yuckCount = localReactions.filter((r) => r.reaction === 'yuck').length;
  const myReaction = localReactions.find((r) => r.profile_id === currentUserId)?.reaction;

  async function react(reaction) {
    if (busy) return;
    setBusy(true);
    const isUnvote = myReaction === reaction;
    // Optimistic update so it feels instant, then reconcile with the server.
    setLocalReactions((prev) => {
      const withoutMine = prev.filter((r) => r.profile_id !== currentUserId);
      return isUnvote ? withoutMine : [...withoutMine, { profile_id: currentUserId, reaction }];
    });
    try {
      if (isUnvote) {
        await supabase.from('meal_reactions').delete().eq('week_plan_meal_id', weekPlanMealId).eq('profile_id', currentUserId);
      } else {
        await supabase
          .from('meal_reactions')
          .upsert({ week_plan_meal_id: weekPlanMealId, profile_id: currentUserId, reaction }, { onConflict: 'week_plan_meal_id,profile_id' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => react('yum')}
        disabled={busy}
        title="Yum"
        className={`text-xs px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${
          myReaction === 'yum' ? 'bg-pine/15 border-pine' : 'border-line text-ink/50'
        }`}
      >
        😋 {yumCount > 0 && yumCount}
      </button>
      <button
        type="button"
        onClick={() => react('yuck')}
        disabled={busy}
        title="Yuck"
        className={`text-xs px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${
          myReaction === 'yuck' ? 'bg-rust/15 border-rust' : 'border-line text-ink/50'
        }`}
      >
        🤢 {yuckCount > 0 && yuckCount}
      </button>
    </div>
  );
}
