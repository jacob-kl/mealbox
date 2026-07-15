import Link from 'next/link';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { flagFor } from '@/lib/cuisineFlags';

export function Card({ children, className = '' }) {
  return <div className={`index-card p-6 ${className}`}>{children}</div>;
}

const TAG_STYLE = {
  fish: { icon: '🐟', tone: 'ocean' },
  shellfish: { icon: '🦐', tone: 'ocean' },
  vegetarian: { icon: '🌱', tone: 'leaf' },
  'cold-friendly': { icon: '❄️', tone: 'ocean' },
  'no-cook': { icon: '🔥', tone: 'ember' },
  'leftovers-friendly': { icon: '♻️', tone: 'leaf' },
  'breakfast-for-dinner': { icon: '🌅', tone: 'sun' },
  mushroom: { icon: '🍄', tone: 'earth' },
  'raw-onion': { icon: '🧅', tone: 'earth' },
  lentil: { icon: '🫘', tone: 'earth' },
  okra: { icon: '🌿', tone: 'leaf' },
  eggplant: { icon: '🍆', tone: 'earth' },
  main: { icon: '🍽️', tone: 'ember' },
  side: { icon: '🥗', tone: 'leaf' },
  private: { icon: '🔒', tone: 'sun' },
};

const TONE_STYLES = {
  pine: 'bg-pine/10 text-pineDark',
  rust: 'bg-rust/10 text-rustDark',
  gold: 'bg-gold/20 text-ink',
  ocean: 'bg-sky-500/12 text-sky-700',
  leaf: 'bg-emerald-500/12 text-emerald-700',
  ember: 'bg-orange-500/12 text-orange-700',
  sun: 'bg-amber-400/20 text-amber-800',
  earth: 'bg-stone-500/12 text-stone-700',
};

export function Badge({ children, tone, className = '' }) {
  const key = typeof children === 'string' ? children.toLowerCase() : null;
  const style = key ? TAG_STYLE[key] : null;
  const resolvedTone = tone || style?.tone || 'pine';
  return (
    <span
      className={`tab-label inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${TONE_STYLES[resolvedTone] || TONE_STYLES.pine} ${className}`}
    >
      {style?.icon && <span className="text-xs not-italic">{style.icon}</span>}
      {children}
    </span>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-pine text-white hover:bg-pineDark',
    secondary: 'border border-line hover:bg-paper',
    ghost: 'hover:bg-paper',
    danger: 'bg-rust text-white hover:bg-rustDark',
  };
  return (
    <button
      className={`rounded-card px-4 py-2 font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Today' },
  { href: '/week', label: 'Week' },
  { href: '/shopping', label: 'Shopping' },
  { href: '/recipes', label: 'Recipes' },
  { href: '/weight', label: 'Weight' },
  { href: '/settings', label: 'Settings' },
];

export function NavBar({ active }) {
  return (
    <header className="border-b border-line bg-card/60 backdrop-blur sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="font-display text-xl">
          Mealbox
        </Link>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm px-3 py-1.5 rounded-card transition-colors ${
                active === item.href ? 'bg-pine text-white' : 'hover:bg-paper'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <span className="ml-2">
            <ThemeSwitcher />
          </span>
        </nav>
      </div>
    </header>
  );
}

export const CUISINES = [
  'american', 'asian', 'caribbean', 'central-african', 'chinese', 'east-african', 'french', 'indian',
  'italian', 'japanese', 'korean', 'mediterranean', 'mexican', 'middle-eastern', 'new-mexico',
  'north-african', 'south-african', 'southern', 'spanish', 'thai', 'vietnamese', 'west-african',
];

export const CUISINE_LABELS = {
  american: 'American',
  asian: 'Asian',
  caribbean: 'Caribbean',
  'central-african': 'Central African',
  chinese: 'Chinese',
  'east-african': 'East African',
  french: 'French',
  indian: 'Indian',
  italian: 'Italian',
  japanese: 'Japanese',
  korean: 'Korean',
  mediterranean: 'Mediterranean',
  mexican: 'Mexican',
  'middle-eastern': 'Middle Eastern',
  'new-mexico': 'New Mexican',
  'north-african': 'North African',
  'south-african': 'South African',
  southern: 'Southern',
  spanish: 'Spanish',
  thai: 'Thai',
  vietnamese: 'Vietnamese',
  'west-african': 'West African',
};

export function cuisineLabel(slug) {
  return CUISINE_LABELS[slug] || (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : slug);
}

/**
 * Cuisine shown as a pill with a subtle, oversized flag watermarked in the
 * background — clipped to the pill's rounded corners, low opacity so it
 * reads as texture rather than competing with the text. Regional cuisines
 * (asian, mediterranean, etc.) pick a flag per-recipe via `seed` so
 * different recipes in the same region show different countries rather
 * than one flag standing in for the whole region.
 */
export function CuisinePill({ cuisine, seed, className = '' }) {
  if (!cuisine) return null;
  const flag = flagFor(cuisine, seed);
  return (
    <span className={`relative inline-flex items-center overflow-hidden rounded-full px-2.5 py-1 bg-pine/8 ${className}`}>
      {flag && (
        <span aria-hidden="true" className="absolute -right-1 -top-2 text-3xl opacity-20 leading-none select-none">
          {flag}
        </span>
      )}
      <span className="tab-label relative text-ink/70">{cuisineLabel(cuisine)}</span>
    </span>
  );
}

export const MACRO_LABELS = [
  { key: 'cal', label: 'Cal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
];
