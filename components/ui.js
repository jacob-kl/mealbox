import Link from 'next/link';

export function Card({ children, className = '' }) {
  return <div className={`index-card p-6 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = 'pine', className = '' }) {
  const tones = {
    pine: 'bg-pine/10 text-pineDark',
    rust: 'bg-rust/10 text-rustDark',
    gold: 'bg-gold/20 text-ink',
  };
  return (
    <span className={`tab-label inline-block rounded-full px-2.5 py-1 ${tones[tone]} ${className}`}>
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
  { href: '/dashboard', label: 'This Week' },
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
        <nav className="flex gap-1">
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
        </nav>
      </div>
    </header>
  );
}

export const CUISINES = ['mediterranean', 'mexican', 'asian', 'indian', 'american'];

export const MACRO_LABELS = [
  { key: 'cal', label: 'Cal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
];
