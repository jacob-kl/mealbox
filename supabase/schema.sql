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
  micros jsonb not null default '{}'::jsonb
);

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
  ingredients jsonb not null default '[]'::jsonb, -- [{ingredient, qty, note}]
  steps text[] not null default '{}',
  macros_per_serving jsonb, -- cached {cal,protein,carbs,fat,fiber}
  created_at timestamptz not null default now()
);

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
create policy "ingredients are readable by any authenticated user"
  on ingredients for select
  to authenticated
  using (true);

-- Profiles: you can read/update your own row, and read your householdmates'.
create policy "read own profile"
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy "read householdmate profiles"
  on profiles for select
  to authenticated
  using (
    household_id is not null
    and household_id = (select household_id from profiles where id = auth.uid())
  );

create policy "insert own profile"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "update own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid());

-- Households: readable/updatable by members of that household.
create policy "read own household"
  on households for select
  to authenticated
  using (id = (select household_id from profiles where id = auth.uid()));

create policy "create a household"
  on households for insert
  to authenticated
  with check (true);

create policy "update own household"
  on households for update
  to authenticated
  using (id = (select household_id from profiles where id = auth.uid()));

-- Weight logs: only the owning profile (and by extension, that user).
create policy "manage own weight logs"
  on weight_logs for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Recipes: global recipes readable by everyone; household recipes scoped.
create policy "read global or own household recipes"
  on recipes for select
  to authenticated
  using (
    household_id is null
    or household_id = (select household_id from profiles where id = auth.uid())
  );

create policy "manage own household recipes"
  on recipes for insert
  to authenticated
  with check (household_id = (select household_id from profiles where id = auth.uid()));

create policy "update own household recipes"
  on recipes for update
  to authenticated
  using (household_id = (select household_id from profiles where id = auth.uid()));

create policy "delete own household recipes"
  on recipes for delete
  to authenticated
  using (household_id = (select household_id from profiles where id = auth.uid()));

-- Week plans + children: scoped to the household.
create policy "manage own household week plans"
  on week_plans for all
  to authenticated
  using (household_id = (select household_id from profiles where id = auth.uid()))
  with check (household_id = (select household_id from profiles where id = auth.uid()));

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
