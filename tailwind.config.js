/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#FAF6EC',
        card: '#FFFDF7',
        ink: '#2B2A26',
        rust: '#C1502E',
        rustDark: '#9C3F24',
        pine: '#3F5C48',
        pineDark: '#2E4536',
        gold: '#D9A441',
        line: '#E4DCC8',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(43,42,38,0.06), 0 6px 16px rgba(43,42,38,0.08)',
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};
