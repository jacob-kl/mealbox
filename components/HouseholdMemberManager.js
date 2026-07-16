'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function MacroFields({ values, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {[
        ['calories', 'Cal'],
        ['protein_g', 'Protein'],
        ['carbs_g', 'Carbs'],
        ['fat_g', 'Fat'],
      ].map(([key, label]) => (
        <label key={key} className="text-xs">
          <span className="block text-ink/50 mb-0.5">{label}</span>
          <input
            type="number"
            value={values[key]}
            onChange={(e) => onChange({ ...values, [key]: e.target.value })}
            className="w-full border border-line rounded-card px-2 py-1 bg-card text-sm"
          />
        </label>
      ))}
    </div>
  );
}

/**
 * Head-chef-only controls: add a new household member (with a
 * personal invite code they'll use to claim it later), edit anyone's
 * macros directly, and promote a member to sous chef.
 * (Displayed as "Head Chef"/"Sous Chef" - underlying household_role values
 * stay head_of_kitchen/kitchen/member; see lib/roleLabels.js.)
 */
export default function HouseholdMemberManager({ household, members, pendingMembers }) {
  const supabase = createClient();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMacros, setNewMacros] = useState({ calories: '', protein_g: '', carbs_g: '', fat_g: '' });
  const [addBusy, setAddBusy] = useState(false);
  const [addedCode, setAddedCode] = useState(null);
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ calories: '', protein_g: '', carbs_g: '', fat_g: '' });
  const [editBusy, setEditBusy] = useState(false);

  const [promotingId, setPromotingId] = useState(null);

  async function handleAddMember(e) {
    e.preventDefault();
    setError(null);
    setAddBusy(true);
    try {
      const res = await fetch('/api/household/add-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: newName,
          targetCalories: newMacros.calories || null,
          targetProteinG: newMacros.protein_g || null,
          targetCarbsG: newMacros.carbs_g || null,
          targetFatG: newMacros.fat_g || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setAddedCode(data.personalInviteCode);
      setNewName('');
      setNewMacros({ calories: '', protein_g: '', carbs_g: '', fat_g: '' });
      window.location.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddBusy(false);
    }
  }

  async function cancelPending(id) {
    await supabase.from('pending_members').delete().eq('id', id);
    window.location.reload();
  }

  function startEditing(member) {
    setEditingId(member.id);
    setEditValues({
      calories: member.target_calories ?? '',
      protein_g: member.target_protein_g ?? '',
      carbs_g: member.target_carbs_g ?? '',
      fat_g: member.target_fat_g ?? '',
    });
  }

  async function saveMacros(memberId) {
    setEditBusy(true);
    await supabase
      .from('profiles')
      .update({
        target_calories: editValues.calories || null,
        target_protein_g: editValues.protein_g || null,
        target_carbs_g: editValues.carbs_g || null,
        target_fat_g: editValues.fat_g || null,
        needs_recalc: false,
      })
      .eq('id', memberId);
    setEditBusy(false);
    setEditingId(null);
    window.location.reload();
  }

  async function promote(memberId) {
    setPromotingId(memberId);
    await supabase.from('profiles').update({ household_role: 'kitchen' }).eq('id', memberId);
    window.location.reload();
  }

  async function demote(memberId) {
    setPromotingId(memberId);
    await supabase.from('profiles').update({ household_role: 'member' }).eq('id', memberId);
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      {pendingMembers?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-ink/50">Waiting to be claimed:</p>
          {pendingMembers.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm bg-paper rounded-card px-3 py-2">
              <span>
                {p.display_name} —{' '}
                <span className="font-mono tracking-widest text-rust">{p.personal_invite_code}</span>
              </span>
              <button type="button" onClick={() => cancelPending(p.id)} className="text-xs text-ink/40 hover:text-rust">
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="border border-line rounded-card p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: m.color }} />
                {m.display_name}
                {m.household_role === 'head_of_kitchen' && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-pine/15 text-pine">Head Chef</span>
                )}
                {m.household_role === 'kitchen' && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-gold/20 text-ink/70">Sous Chef</span>
                )}
                {m.is_placeholder && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-rust/15 text-rust">Not yet claimed</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {m.household_role !== 'head_of_kitchen' && editingId !== m.id && (
                  <button type="button" onClick={() => startEditing(m)} className="text-xs text-pine hover:underline">
                    Edit macros
                  </button>
                )}
                {m.household_role === 'member' && (
                  <button
                    type="button"
                    onClick={() => promote(m.id)}
                    disabled={promotingId === m.id}
                    className="text-xs px-2 py-1 rounded-card border border-line hover:bg-paper disabled:opacity-50"
                  >
                    Promote to sous chef
                  </button>
                )}
                {m.household_role === 'kitchen' && (
                  <button
                    type="button"
                    onClick={() => demote(m.id)}
                    disabled={promotingId === m.id}
                    className="text-xs px-2 py-1 rounded-card border border-line hover:bg-paper disabled:opacity-50"
                  >
                    Remove sous chef role
                  </button>
                )}
              </div>
            </div>

            {editingId === m.id ? (
              <div className="mt-2 space-y-2">
                <MacroFields values={editValues} onChange={setEditValues} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveMacros(m.id)}
                    disabled={editBusy}
                    className="text-xs px-3 py-1 rounded-card bg-pine text-white disabled:opacity-50"
                  >
                    {editBusy ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-xs px-3 py-1 rounded-card border border-line">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="font-mono text-xs text-ink/60 mt-1">
                {m.target_calories} cal · {m.target_protein_g}p / {m.target_carbs_g}c / {m.target_fat_g}f
              </p>
            )}
            {m.is_placeholder && (
              <p className="text-xs text-ink/50 mt-1.5">
                Counts fully in meal planning already. Share this code so they can claim their own login whenever they're ready:{' '}
                <span className="font-mono tracking-widest text-rust">{m.personal_invite_code}</span>
              </p>
            )}
          </div>
        ))}
      </div>

      {showAddForm ? (
        <form onSubmit={handleAddMember} className="border border-line rounded-card p-3 space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Their name"
            required
            className="w-full border border-line rounded-card px-3 py-1.5 bg-card text-sm"
          />
          <p className="text-xs text-ink/50">
            Macros are optional here — leave blank and they can set their own later, or fill them in now (handy for a
            kid who won't be running the calculator themselves).
          </p>
          <MacroFields values={newMacros} onChange={setNewMacros} />
          {error && <p className="text-xs text-rust">{error}</p>}
          {addedCode && (
            <p className="text-xs bg-paper rounded-card px-3 py-2">
              Give them this code to claim their spot:{' '}
              <span className="font-mono tracking-widest text-rust">{addedCode}</span>
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={addBusy} className="text-xs px-3 py-1.5 rounded-card bg-pine text-white disabled:opacity-50">
              {addBusy ? 'Creating…' : 'Create their spot'}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-xs px-3 py-1.5 rounded-card border border-line">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="text-sm px-3 py-1.5 rounded-card border border-line hover:bg-paper"
        >
          + Add household member
        </button>
      )}
    </div>
  );
}
