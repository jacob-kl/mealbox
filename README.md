# Mealbox

A hosted, multi-household meal planning app: macro calculator on signup, a
shared recipe library organized by cuisine, an auto-generated weekly menu
that respects each household's dietary rules and structure (theme nights,
breakfast-for-dinner, etc.), and a weight tracker that automatically
recalculates everyone's macro targets every time their weight moves 5 lb.

This is a from-scratch rebuild of a personal single-household meal planner,
redesigned to support **any number of households**, each with their own
members, dietary rules, and recipe library, hosted for free on Vercel +
Supabase.

---

## Stack

| Piece | Choice | Why |
|---|---|---|
| Framework | [Next.js 14](https://nextjs.org) (App Router) | Free hosting on Vercel, API routes, no separate backend to run |
| Hosting | [Vercel](https://vercel.com) (Hobby/free tier) | One-click deploy from GitHub, generous free tier |
| Database + Auth | [Supabase](https://supabase.com) (Free tier) | Postgres + built-in Google/email login + Row Level Security, no cost at this scale |
| Styling | Tailwind CSS | No separate design system to maintain |

Both Vercel's Hobby plan and Supabase's Free plan are $0/month and comfortably
cover a personal or small-group app like this one. You will need your own
free accounts on each.

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick any
   name/region, and save the database password somewhere safe (you likely
   won't need it directly).
2. Once the project is ready, open **Project Settings → API** and copy:
   - `Project URL` → this is `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → this is `SUPABASE_SERVICE_ROLE_KEY` (**keep this
     secret** — it bypasses all security rules; it's only ever used from
     your own machine to seed the database, never in the deployed app)
3. Open the **SQL Editor**, paste in the entire contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates
   every table and all the Row Level Security policies that keep one
   household's data private from another's.
4. Open **Authentication → Providers**:
   - **Email** is on by default (used for the magic-link sign-in).
   - To enable **Google**, follow Supabase's prompt to add a Google OAuth
     Client ID/Secret ([Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
     create an OAuth Client ID, add `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
     as an authorized redirect URI).
5. Open **Authentication → URL Configuration** and add your app's URL
   (e.g. `https://your-app.vercel.app` and `http://localhost:3000` for local
   dev) to **Redirect URLs**.

## 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the four values from step 1. `.env.local` is git-ignored and never
committed.

## 3. Install dependencies and seed the database

```bash
npm install
npm run seed
```

The seed script (`scripts/seed.mjs`) reads `supabase/seed/ingredients.json`
(a nutrition database of 125+ ingredients) and every file in
`supabase/seed/recipes/` (organized by cuisine — Mediterranean, Mexican,
Asian, Indian, American), computes each recipe's per-serving macros directly
from the ingredient data, and pushes everything into your Supabase project
as the **shared global recipe library** every household can draw from.

Re-running the seed script will duplicate the global recipes (it always
inserts). If you need a clean reseed, delete rows from `recipes` where
`household_id is null` first.

## 4. Run it locally

```bash
npm run dev
```

Visit `http://localhost:3000`. First sign-in routes you through onboarding:
create or join a household, then fill out the macro calculator (age, sex,
height, weight, activity level, goal) to get your personal calorie/protein/
carb/fat targets.

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **New Project** → import the repo. Vercel auto-detects Next.js.
3. Add the same four environment variables from `.env.local` (skip the
   service-role key — it's only needed for local seeding, not the deployed
   app) under **Project Settings → Environment Variables**.
4. Deploy. Add the resulting `https://your-app.vercel.app` URL to Supabase's
   **Redirect URLs** (step 1.5 above) if you haven't already.

That's it — the whole stack costs $0/month at personal/small-group scale.

---

## How it works

### Accounts & households

Anyone can sign up with Google or an email magic link. On first login they
either **create a household** (which generates a shareable invite code) or
**join one** with a code someone else shares. A household can have any
number of members, each with their own macro profile.

### Macro calculator

`lib/macros.js` implements the calculation, run once at onboarding and again
by the weight tracker:

- **BMR** via the Mifflin-St Jeor equation
- **TDEE** = BMR × an activity multiplier (sedentary → very active)
- **Calorie target** = TDEE + a goal adjustment (-500 cut / 0 maintain / +300 bulk)
- **Protein** = 1.8-2.2 g/kg bodyweight depending on goal
- **Fat** = 28% of total calories
- **Carbs** = whatever calories are left

These are sensible defaults, not medical advice — anyone can go back through
onboarding's math manually if they want a different split.

### Weight tracker → automatic recalculation

Every weigh-in is logged (`app/api/weight/log/route.js`). Each profile
stores a `baseline_weight_lb` — the weight its current targets were
calculated against. The moment a new weigh-in is 5 lb away from that
baseline (either direction), the API immediately recalculates targets using
the same stored age/height/activity/goal and the new weight, and resets the
baseline. No manual step required.

### Recipes & the auto-built week

Recipes live in one shared library (`recipes` table), each tagged with a
`cuisine`, `meal_type` (breakfast/lunch/dinner/snack), and free-form `tags`
(`fish`, `shellfish`, `vegetarian`, `leftovers-friendly`, `no-cook`, etc.).
Each household's **Settings** page lets you:

- Toggle a **dietary blocklist** (fish, shellfish, mushroom, raw onion,
  lentils, okra, eggplant) — recipes carrying those tags are never
  auto-selected for that household.
- Configure the **weekly structure**: what meal type each day should be
  (e.g. Sunday = breakfast, everything else = dinner) and an optional theme
  tag for a night (e.g. a "leftovers night").

Hitting **Build this week** on the dashboard (`lib/weekBuilder.js`) picks one
recipe per day that satisfies that day's rule and the household's blocklist,
avoids repeating anything used in the last two weeks, and scales portions
per member based on their calorie target for that meal (`lib/nutrition.js`).
You can optionally lock the whole week to one cuisine, or hit **Swap** on
any single day to get a different pick for just that night. Lunches are
generated once per person per week (a batch-cooked model), matching the
original app's format.

---

## Project structure

```
app/
  login/              Google + email magic-link sign-in
  auth/callback/       OAuth/magic-link session exchange
  onboarding/          Household create/join + macro calculator
  dashboard/           Current week view (server) + WeekView (client)
  recipes/             Recipe library browser, filterable by cuisine/meal type
  weight/              Weight log, trend chart, current targets
  settings/            Invite code, members, dietary blocklist, day structure
  api/
    week/generate/      Auto-builds a full week for the household
    week/swap/           Regenerates a single day
    weight/log/           Logs a weigh-in, auto-recalculates at the 5 lb threshold
lib/
  macros.js            BMR/TDEE/macro-target calculator (pure functions)
  nutrition.js         Ingredient → recipe macro scaling
  weekBuilder.js       The auto-build/swap algorithm
  dates.js             Week-start / day-label helpers
  supabase/            Browser, server, and middleware Supabase clients
components/            Shared UI + WeekView, RecipeBrowser, WeightTracker, SettingsForm
supabase/
  schema.sql           Full Postgres schema + Row Level Security policies
  seed/ingredients.json 125+ ingredient nutrition database
  seed/recipes/*.json   Recipe library, one file per cuisine
scripts/seed.mjs       Populates ingredients + recipes from the seed files
```

## Extending it

- **Add recipes**: drop a new object into the right cuisine file under
  `supabase/seed/recipes/`, or add a new cuisine file entirely — the seed
  script picks up any `.json` file in that folder. Ingredient names must
  exist in `supabase/seed/recipes/../ingredients.json` — the script throws
  a clear error naming the recipe and the missing ingredient if not.
- **Add a cuisine to the UI**: add it to the `CUISINES` array in
  `components/ui.js`.
- **Household-specific recipes**: the schema already supports recipes with
  a non-null `household_id` (a household's own private additions) — the UI
  for adding one from the app isn't built yet, but the API/RLS is ready for it.
- **Shopping list**: not included in this first pass. The original app's
  shopping-list parser (ranges, N+ quantities, tilde weights) is a good
  candidate for a follow-up once the core loop above feels right.
