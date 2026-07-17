-- ============================================================================
-- Mealbox schema
-- Run this once in the Supabase SQL editor for a fresh project (or via
-- `supabase db push` if you're using the CLI). Safe to re-run: uses
-- `create table if not exists` / `create or replace` throughout.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Households
-- ----------------------------------------------------------------------------
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  settings jsonb not null default '{}'::jsonb, -- structureRules, blockedTags, cuisineFocus
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Profiles — one row per authenticated user, always 1:1 with auth.users.
-- Holds the macro-calculator inputs/outputs and the weight-recalc baseline.
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  display_name text not null,
  color text not null default '#3F5C48',
  sex text check (sex in ('male','female')),
  birth_year int,
  height_cm numeric,
  activity_level text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  goal text check (goal in ('cut','maintain','bulk')),
  baseline_weight_lb numeric,      -- weight the current targets were calculated against
  target_calories numeric,
  target_protein_g numeric,
  target_carbs_g numeric,
  target_fat_g numeric,
  needs_recalc boolean not null default false,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Weight logs
-- ----------------------------------------------------------------------------
create table if not exists weight_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  weight_lb numeric not null,
  logged_at timestamptz not null default now()
);

create index if not exists weight_logs_profile_idx on weight_logs(profile_id, logged_at desc);

-- ----------------------------------------------------------------------------
-- Ingredients — shared global nutrition database
-- ----------------------------------------------------------------------------
create table if not exists ingredients (
  name text primary key,
  serving_qty numeric not null default 1,
  serving_unit text,
  serving_label text,
  cal numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  fiber numeric not null default 0,
  micros jsonb not null default '{}'::jsonb,
  sub_group text, -- functional substitution group (e.g. 'breading_coating', 'poultry_breast_cutlet') — see lib/substitutions.js
  dietary_tags text[] not null default '{}', -- e.g. {gluten-free, dairy-free, vegan, low-carb}
  brand text -- null = generic/store-agnostic; otherwise the specific brand (e.g. 'Kraft')
);

alter table ingredients add column if not exists sub_group text;
alter table ingredients add column if not exists dietary_tags text[] not null default '{}';

-- ----------------------------------------------------------------------------
-- Recipes — household_id null = shared global library, otherwise a
-- household's own custom recipe.
-- ----------------------------------------------------------------------------
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  cuisine text not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  tags text[] not null default '{}',
  base_servings numeric not null default 1,
  ingredients jsonb not null default '[]'::jsonb, -- [{ingredient, qty, note}] - quick/simplified version
  ingredients_full jsonb, -- optional expanded ingredient list for the full/authentic version; null if not yet written
  steps text[] not null default '{}', -- quick reference steps
  steps_detailed text[], -- optional fuller, more technique-focused version of the same recipe; null if not yet written
  macros_per_serving jsonb, -- cached {cal,protein,carbs,fat,fiber} - reflects the QUICK ingredient list
  macros_per_serving_full jsonb, -- cached macros for the full ingredient list, when one exists
  created_at timestamptz not null default now()
);

alter table recipes add column if not exists steps_detailed text[];
alter table recipes add column if not exists ingredients_full jsonb;
alter table recipes add column if not exists macros_per_serving_full jsonb;

create index if not exists recipes_cuisine_idx on recipes(cuisine);
create index if not exists recipes_meal_type_idx on recipes(meal_type);
create index if not exists recipes_household_idx on recipes(household_id);

-- ----------------------------------------------------------------------------
-- Week plans
-- ----------------------------------------------------------------------------
create table if not exists week_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  week_start date not null,
  cuisine_focus text,
  created_at timestamptz not null default now(),
  unique(household_id, week_start)
);

create table if not exists week_plan_days (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references week_plans(id) on delete cascade,
  day_index int not null check (day_index between 0 and 6),
  meal_type text not null,
  label text,
  recipe_id uuid references recipes(id),
  portions jsonb not null default '[]'::jsonb, -- [{profileId, servings}]
  unique(week_plan_id, day_index)
);

create table if not exists week_plan_lunches (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references week_plans(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  recipe_id uuid references recipes(id),
  servings numeric not null default 1,
  unique(week_plan_id, profile_id)
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table households enable row level security;
alter table profiles enable row level security;
alter table weight_logs enable row level security;
alter table ingredients enable row level security;
alter table recipes enable row level security;
alter table week_plans enable row level security;
alter table week_plan_days enable row level security;
alter table week_plan_lunches enable row level security;

-- Everyone signed in can read the shared ingredient database.
drop policy if exists "ingredients are readable by any authenticated user" on ingredients;
create policy "ingredients are readable by any authenticated user"
  on ingredients for select
  to authenticated
  using (true);

-- Profiles: you can read/update your own row, and read your householdmates'.
drop policy if exists "read own profile" on profiles;
create policy "read own profile"
  on profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "read householdmate profiles" on profiles;
create policy "read householdmate profiles"
  on profiles for select
  to authenticated
  using (
    household_id is not null
    and household_id = (select household_id from profiles where id = auth.uid())
  );

drop policy if exists "insert own profile" on profiles;
create policy "insert own profile"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "update own profile" on profiles;
create policy "update own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid());

-- Households: readable/updatable by members of that household.
drop policy if exists "read own household" on households;
create policy "read own household"
  on households for select
  to authenticated
  using (id = (select household_id from profiles where id = auth.uid()));

drop policy if exists "create a household" on households;
create policy "create a household"
  on households for insert
  to authenticated
  with check (true);

drop policy if exists "update own household" on households;
create policy "update own household"
  on households for update
  to authenticated
  using (id = (select household_id from profiles where id = auth.uid()));

-- Weight logs: only the owning profile (and by extension, that user).
drop policy if exists "manage own weight logs" on weight_logs;
create policy "manage own weight logs"
  on weight_logs for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Recipes: global recipes readable by everyone; household recipes scoped.
drop policy if exists "read global or own household recipes" on recipes;
create policy "read global or own household recipes"
  on recipes for select
  to authenticated
  using (
    household_id is null
    or household_id = (select household_id from profiles where id = auth.uid())
  );

drop policy if exists "manage own household recipes" on recipes;
create policy "manage own household recipes"
  on recipes for insert
  to authenticated
  with check (household_id = (select household_id from profiles where id = auth.uid()));

drop policy if exists "update own household recipes" on recipes;
create policy "update own household recipes"
  on recipes for update
  to authenticated
  using (household_id = (select household_id from profiles where id = auth.uid()));

drop policy if exists "delete own household recipes" on recipes;
create policy "delete own household recipes"
  on recipes for delete
  to authenticated
  using (household_id = (select household_id from profiles where id = auth.uid()));

-- Week plans + children: scoped to the household.
drop policy if exists "manage own household week plans" on week_plans;
create policy "manage own household week plans"
  on week_plans for all
  to authenticated
  using (household_id = (select household_id from profiles where id = auth.uid()))
  with check (household_id = (select household_id from profiles where id = auth.uid()));

drop policy if exists "manage own household week plan days" on week_plan_days;
create policy "manage own household week plan days"
  on week_plan_days for all
  to authenticated
  using (
    week_plan_id in (
      select id from week_plans
      where household_id = (select household_id from profiles where id = auth.uid())
    )
  )
  with check (
    week_plan_id in (
      select id from week_plans
      where household_id = (select household_id from profiles where id = auth.uid())
    )
  );

drop policy if exists "manage own household week plan lunches" on week_plan_lunches;
create policy "manage own household week plan lunches"
  on week_plan_lunches for all
  to authenticated
  using (
    week_plan_id in (
      select id from week_plans
      where household_id = (select household_id from profiles where id = auth.uid())
    )
  )
  with check (
    week_plan_id in (
      select id from week_plans
      where household_id = (select household_id from profiles where id = auth.uid())
    )
  );

-- ============================================================================
-- Fixes applied after initial testing (kept here so a fresh setup never
-- hits these — see git history / chat log for the original bug reports):
--
-- 1. The "read householdmate profiles" policy queried `profiles` from
--    within a policy ON `profiles`, causing infinite recursion. Fixed with
--    a SECURITY DEFINER helper that bypasses RLS for just that lookup.
-- 2. Creating a household requires reading it back immediately, before the
--    creator's own profile.household_id is set — a chicken-and-egg RLS
--    problem. Fixed with a `created_by` column.
-- 3. Joining a household by invite code requires resolving that code to an
--    id without already having read access to the row. Fixed with a second
--    SECURITY DEFINER function.
-- ============================================================================

create or replace function public.current_household_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select household_id from profiles where id = auth.uid()
$$;

drop policy if exists "read householdmate profiles" on profiles;
create policy "read householdmate profiles"
  on profiles for select
  to authenticated
  using (
    household_id is not null
    and household_id = public.current_household_id()
  );

drop policy if exists "read own household" on households;
create policy "read own household" on households for select to authenticated
  using (id = public.current_household_id());

drop policy if exists "update own household" on households;
create policy "update own household" on households for update to authenticated
  using (id = public.current_household_id());

drop policy if exists "read global or own household recipes" on recipes;
create policy "read global or own household recipes" on recipes for select to authenticated
  using (household_id is null or household_id = public.current_household_id());

drop policy if exists "manage own household recipes" on recipes;
create policy "manage own household recipes" on recipes for insert to authenticated
  with check (household_id = public.current_household_id());

drop policy if exists "update own household recipes" on recipes;
create policy "update own household recipes" on recipes for update to authenticated
  using (household_id = public.current_household_id());

drop policy if exists "delete own household recipes" on recipes;
create policy "delete own household recipes" on recipes for delete to authenticated
  using (household_id = public.current_household_id());

drop policy if exists "manage own household week plans" on week_plans;
create policy "manage own household week plans" on week_plans for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

drop policy if exists "manage own household week plan days" on week_plan_days;
create policy "manage own household week plan days" on week_plan_days for all to authenticated
  using (week_plan_id in (select id from week_plans where household_id = public.current_household_id()))
  with check (week_plan_id in (select id from week_plans where household_id = public.current_household_id()));

drop policy if exists "manage own household week plan lunches" on week_plan_lunches;
create policy "manage own household week plan lunches" on week_plan_lunches for all to authenticated
  using (week_plan_id in (select id from week_plans where household_id = public.current_household_id()))
  with check (week_plan_id in (select id from week_plans where household_id = public.current_household_id()));

alter table households add column if not exists created_by uuid references auth.users(id) default auth.uid();

drop policy if exists "read own household" on households;
create policy "read own household"
  on households for select
  to authenticated
  using (
    created_by = auth.uid()
    or id = public.current_household_id()
  );

create or replace function public.household_id_for_invite_code(code text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from households where invite_code = code
$$;

-- ============================================================================
-- Expanded meal types: sauces/condiments and desserts joined the original
-- breakfast/lunch/dinner/snack set.
-- ============================================================================
alter table recipes drop constraint if exists recipes_meal_type_check;
alter table recipes add constraint recipes_meal_type_check
  check (meal_type in ('breakfast','lunch','dinner','snack','sauce','dessert'));

-- ============================================================================
-- v3: shopping list + private recipes
-- ============================================================================

create table if not exists shopping_list_checks (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references week_plans(id) on delete cascade,
  ingredient_name text not null,
  checked boolean not null default true,
  checked_count int not null default 0,
  checked_by uuid references profiles(id),
  checked_at timestamptz not null default now(),
  unique(week_plan_id, ingredient_name)
);

alter table shopping_list_checks add column if not exists checked_count int not null default 0;

alter table shopping_list_checks enable row level security;

drop policy if exists "manage own household shopping list checks" on shopping_list_checks;
create policy "manage own household shopping list checks"
  on shopping_list_checks for all
  to authenticated
  using (week_plan_id in (select id from week_plans where household_id = public.current_household_id()))
  with check (week_plan_id in (select id from week_plans where household_id = public.current_household_id()));

-- Recipes already support household_id for private recipes (see the
-- "manage own household recipes" policies above) — no schema change needed,
-- just an app-side form to create them. Add a course field so a dinner slot
-- can be composed of a main + a side rather than always one combined dish.
alter table recipes add column if not exists course text not null default 'complete';
alter table recipes drop constraint if exists recipes_course_check;
alter table recipes add constraint recipes_course_check
  check (course in ('complete', 'main', 'side'));

alter table week_plan_meals add column if not exists course text not null default 'main';

drop index if exists week_plan_meals_shared_idx;
create unique index if not exists week_plan_meals_shared_idx
  on week_plan_meals(week_plan_id, day_index, meal_slot, course) where profile_id is null;

-- Per-ingredient personalization: rather than scaling a whole recipe by one
-- uniform factor (which can't change its underlying macro ratio at all —
-- protein and carbs get multiplied by the exact same number), the builder
-- now stores an adjusted ingredient list and the resulting macros directly
-- on the meal instance. Falls back to recipe.macros_per_serving * servings
-- for older rows that predate this (computed_macros is null).
alter table week_plan_meals add column if not exists computed_macros jsonb;
alter table week_plan_meals add column if not exists ingredients_override jsonb;

-- The seed script clears and rebuilds the global recipe library on every
-- run. Old week plans referencing those recipe ids shouldn't block that —
-- they should just lose the reference (that meal shows as unmatched until
-- the week is rebuilt).
alter table week_plan_meals drop constraint if exists week_plan_meals_recipe_id_fkey;
alter table week_plan_meals add constraint week_plan_meals_recipe_id_fkey
  foreign key (recipe_id) references recipes(id) on delete set null;

-- ============================================================================
-- v2: diet-type presets, configurable meal structure, and the day tracker.
-- ============================================================================

alter table profiles add column if not exists diet_type text default 'balanced';
alter table profiles drop constraint if exists profiles_diet_type_check;
alter table profiles add constraint profiles_diet_type_check
  check (diet_type in ('balanced','high_protein','low_fat','low_carb','high_carb'));

-- Replaces week_plan_days + week_plan_lunches with one table that can hold
-- any number of meal slots per day (breakfast/lunch/dinner/snack1-4).
-- profile_id null = a shared household meal (dinner/breakfast) — `portions`
-- holds one entry per member. profile_id set = an individual meal (lunch,
-- snacks) that can differ per person — `servings` is that person's amount.
drop table if exists week_plan_days cascade;
drop table if exists week_plan_lunches cascade;

create table if not exists week_plan_meals (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references week_plans(id) on delete cascade,
  day_index int not null check (day_index between 0 and 6),
  meal_slot text not null check (meal_slot in ('breakfast','lunch','dinner','dessert','snack1','snack2','snack3','snack4')),
  profile_id uuid references profiles(id) on delete cascade,
  recipe_id uuid references recipes(id),
  label text,
  servings numeric not null default 1,
  portions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Migration for existing installs: the original constraint didn't include
-- 'dessert'. Postgres auto-names an inline CHECK on a fresh table
-- '<table>_<column>_check' — drop and re-add with the wider allowlist.
alter table week_plan_meals drop constraint if exists week_plan_meals_meal_slot_check;
alter table week_plan_meals add constraint week_plan_meals_meal_slot_check
  check (meal_slot in ('breakfast','lunch','dinner','dessert','snack1','snack2','snack3','snack4'));

create unique index if not exists week_plan_meals_shared_idx
  on week_plan_meals(week_plan_id, day_index, meal_slot) where profile_id is null;
create unique index if not exists week_plan_meals_individual_idx
  on week_plan_meals(week_plan_id, day_index, meal_slot, profile_id) where profile_id is not null;

alter table week_plan_meals enable row level security;

drop policy if exists "manage own household week plan meals" on week_plan_meals;
create policy "manage own household week plan meals"
  on week_plan_meals for all
  to authenticated
  using (week_plan_id in (select id from week_plans where household_id = public.current_household_id()))
  with check (week_plan_id in (select id from week_plans where household_id = public.current_household_id()));

-- Personal, private daily log: checking off a planned meal, or adding a
-- custom/off-plan one. Macros are snapshotted at log time so editing a
-- recipe later doesn't rewrite history.
create table if not exists meal_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  log_date date not null,
  week_plan_meal_id uuid references week_plan_meals(id) on delete cascade,
  custom_name text,
  cal numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists meal_log_profile_date_idx on meal_log(profile_id, log_date);

alter table meal_log enable row level security;

drop policy if exists "manage own meal log" on meal_log;
create policy "manage own meal log"
  on meal_log for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Allergies (per-person) and household roles

alter table profiles add column if not exists allergies jsonb not null default '[]'::jsonb;
-- Each entry: { "name": "Peanut", "category": "peanut" | "custom", "separable_ok": boolean }
-- category matches an ingredients.allergens tag when it's one of the common
-- ones; "custom" entries (e.g. "Onion") are matched by ingredient name/
-- sub_group text search instead, since they're not part of the fixed list.
-- separable_ok: true means this person is fine as long as the allergen is
-- a separable component (garnish/topping/side) they can just leave off;
-- false means any presence in the dish, even cooked in, is a hard exclude.

alter table profiles add column if not exists household_role text not null default 'member'
  check (household_role in ('head_of_kitchen', 'member'));
-- The head of kitchen is the only member who can invite/add other people to
-- the household. Whoever completes onboarding first for a new household is
-- automatically the head of kitchen (set in the onboarding flow).

-- One-time backfill: for households that existed before the head_of_kitchen
-- role was introduced, promote whichever member has the oldest account
-- (first to sign up) to head of kitchen, so existing households aren't left
-- with everyone at 'member' and nobody able to invite.
update profiles p
set household_role = 'head_of_kitchen'
where p.id = (
  select p2.id from profiles p2
  where p2.household_id = p.household_id
  order by p2.created_at asc
  limit 1
)
and not exists (
  select 1 from profiles p3
  where p3.household_id = p.household_id
  and p3.household_role = 'head_of_kitchen'
);

-- Ingredient-level allergen tags (e.g. {peanut, dairy}), matching the same
-- text[] convention as dietary_tags. Used by lib/allergies.js to flag
-- recipes that conflict with a household member's declared allergies.
alter table ingredients add column if not exists allergens text[] not null default '{}';

-- ----------------------------------------------------------------------------
-- Three-tier household roles, head-of-kitchen member management, and
-- personal invite codes for adding people who aren't ready to self-onboard
-- (a partner you'd rather set up directly, or eventually a kid).

alter table profiles drop constraint if exists profiles_household_role_check;
alter table profiles add constraint profiles_household_role_check
  check (household_role in ('head_of_kitchen', 'kitchen', 'member'));
-- head_of_kitchen: can invite people, add members directly, set anyone's
--   macros, promote/demote others, and edit the shared meal plan.
-- kitchen: can edit the shared meal plan (swap/remove ingredients, adjust
--   the week) but cannot add people or change anyone's macros.
-- member: can view their own plan and log weight/meals, but can't edit the
--   shared plan. Default for everyone except the head of kitchen.

create or replace function public.is_head_of_kitchen()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select household_role from profiles where id = auth.uid()) = 'head_of_kitchen', false)
$$;

-- The head of kitchen can update any profile in their own household (macros,
-- role/promotion). Regular self-updates (target macros via the personal
-- recalculate flow, etc.) still work via the existing "update own profile"
-- policy below - this adds to that, it doesn't replace it.
drop policy if exists "head of kitchen updates household profiles" on profiles;
create policy "head of kitchen updates household profiles"
  on profiles for update
  to authenticated
  using (public.is_head_of_kitchen() and household_id = public.current_household_id());

-- Pending members: a placeholder reserved by the head of kitchen for someone
-- who hasn't signed up yet. Not tied to auth.users at all - just a name, a
-- unique claim code, and optional prefilled macro targets. When the real
-- person signs up with this code (instead of the general household invite
-- code), their new profile is pre-filled from this row, then it's deleted.
create table if not exists pending_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  display_name text not null,
  personal_invite_code text not null unique,
  prefill_target_calories numeric,
  prefill_target_protein_g numeric,
  prefill_target_carbs_g numeric,
  prefill_target_fat_g numeric,
  created_at timestamptz not null default now()
);

alter table pending_members enable row level security;

drop policy if exists "head of kitchen manages pending members" on pending_members;
create policy "head of kitchen manages pending members"
  on pending_members for all
  to authenticated
  using (public.is_head_of_kitchen() and household_id = public.current_household_id())
  with check (public.is_head_of_kitchen() and household_id = public.current_household_id());

-- Looking up a personal code happens before the new person has any household
-- membership, so this mirrors household_id_for_invite_code: a narrow,
-- security-definer function rather than a permissive table policy. The code
-- itself is the security boundary.
create or replace function public.lookup_personal_invite_code(code text)
returns table (
  household_id uuid,
  display_name text,
  prefill_target_calories numeric,
  prefill_target_protein_g numeric,
  prefill_target_carbs_g numeric,
  prefill_target_fat_g numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select household_id, display_name, prefill_target_calories, prefill_target_protein_g,
         prefill_target_carbs_g, prefill_target_fat_g
  from pending_members where personal_invite_code = code
$$;

-- Called after the new person's profile has been created successfully, to
-- remove the now-used placeholder.
create or replace function public.consume_personal_invite_code(code text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from pending_members where personal_invite_code = code
$$;

-- ----------------------------------------------------------------------------
-- Revised household member creation. The pending_members table added earlier
-- tonight required someone to fully sign up and "claim" a code before they
-- counted as a real household member anywhere - including in week planning.
-- That's the wrong default: a member the head of kitchen adds should show up
-- in meal planning immediately, using whatever macros were set for them,
-- exactly as if they'd onboarded themselves. This replaces that design.
--
-- profiles.id keeps meaning exactly what it always has (= auth.users.id) -
-- nothing that currently assumes that breaks. What's new: the head of
-- kitchen can create the auth user AND the profile at the same moment,
-- using a placeholder email nobody needs to check. The real person later
-- "claims" it with a personal code, at which point they set their own real
-- email and password on that same account - same profile the whole time,
-- so nothing they were already planned for gets lost.

alter table profiles add column if not exists personal_invite_code text unique;
alter table profiles add column if not exists is_placeholder boolean not null default false;

-- ----------------------------------------------------------------------------
-- Full-recipe editing. Swap/remove previously only ever touched the quick
-- ingredient list (ingredients_override) - the full/authentic version had
-- no equivalent, so editing it silently did nothing. These mirror the same
-- pattern for the full list, plus store a rewritten steps text whenever a
-- swap changes what the steps should say (e.g. swapping chicken for turkey
-- means the instructions should say "turkey," not still say "chicken").
alter table week_plan_meals add column if not exists ingredients_full_override jsonb;
alter table week_plan_meals add column if not exists steps_override text[];
alter table week_plan_meals add column if not exists steps_full_override text[];
alter table week_plan_meals add column if not exists computed_macros_full jsonb;

-- Per-person lunch schedule (which days, batch vs fresh), so one household
-- member can batch-cook while another gets a fresh lunch daily. Lives on
-- the profile since it's inherently personal, not a household-wide setting.
-- Shape: { days: {0: bool, ..., 6: bool}, strategy: {0: 'batch'|'fresh', ...} }
-- Falls back to the household's mealDays/lunchPlan settings when null, so
-- existing households keep working exactly as before until someone sets
-- their own personal schedule.
alter table profiles add column if not exists lunch_schedule jsonb;

-- ----------------------------------------------------------------------------
-- Meal reactions (yum/yuck). Anyone in the household can react to a planned
-- meal, regardless of their edit role - voting is meant to surface opinion
-- to whoever CAN edit the plan (head of kitchen/kitchen), not to be gated
-- behind the same permission as making the edit itself.
create table if not exists meal_reactions (
  id uuid primary key default gen_random_uuid(),
  week_plan_meal_id uuid not null references week_plan_meals(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  reaction text not null check (reaction in ('yum', 'yuck')),
  created_at timestamptz not null default now(),
  unique (week_plan_meal_id, profile_id)
);

alter table meal_reactions enable row level security;

drop policy if exists "household members react to household meals" on meal_reactions;
create policy "household members react to household meals"
  on meal_reactions for all
  to authenticated
  using (
    week_plan_meal_id in (
      select wpm.id from week_plan_meals wpm
      join week_plans wp on wp.id = wpm.week_plan_id
      where wp.household_id = public.current_household_id()
    )
  )
  with check (
    profile_id = auth.uid()
    and week_plan_meal_id in (
      select wpm.id from week_plan_meals wpm
      join week_plans wp on wp.id = wpm.week_plan_id
      where wp.household_id = public.current_household_id()
    )
  );

-- ----------------------------------------------------------------------------
-- Feedback. Stored here regardless of whether email delivery is configured,
-- so nothing submitted is ever lost even if RESEND_API_KEY isn't set yet -
-- Jake can always read submissions directly from this table in Supabase.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- Anyone signed in can submit feedback, but can't read anyone's (including
-- their own) back out through the app - this is a one-way mailbox, not a
-- feed. Jake reads submissions directly in the Supabase table editor.
drop policy if exists "submit feedback" on feedback;
create policy "submit feedback"
  on feedback for insert
  to authenticated
  with check (true);

-- Per-person overrides for the shared meal-days table and snack count,
-- extending the same pattern used for lunch_schedule. meal_days holds
-- whether THIS person wants breakfast/dinner/dessert on a given day (a
-- shared dish still gets cooked if ANY member wants it that day - this is
-- about whether THIS person gets a portion of it, not whether the
-- household cooks it at all). snacks_per_day is a simple per-person count
-- override. Both fall back to the household's settings when null.
alter table profiles add column if not exists meal_days jsonb;
alter table profiles add column if not exists snacks_per_day integer;

-- ----------------------------------------------------------------------------
-- Brand tracking for ingredients. Bulk-importing USDA's branded foods
-- data (thousands of specific national-brand products) alongside the
-- existing generic ingredients meant the ingredient picker needed a way to
-- put the generic version first when you don't care about a specific
-- brand - e.g. searching "milk" surfaces "Whole milk (generic)" before
-- "Kraft 2% Milk". null = generic/store-agnostic; every seed file now sets
-- this explicitly (existing hand-curated entries stay null unless they
-- were already a specific product like "Daisy sour cream").
alter table ingredients add column if not exists brand text;
create index if not exists ingredients_brand_idx on ingredients (brand);
-- Queries that populate an ingredient picker should sort nulls first so
-- generics lead, then alphabetically within each group, e.g. in supabase-js:
--   .order('brand', { ascending: true, nullsFirst: true }).order('name')
