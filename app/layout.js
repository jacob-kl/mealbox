import './globals.css';

export const metadata = {
  title: 'Mealbox — Weekly Meal Planning',
  description: 'Household meal planning with macro targets, auto-built weeks, and a weight-aware recalculator.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body min-h-screen text-ink">
        {children}
      </body>
    </html>
  );
}
