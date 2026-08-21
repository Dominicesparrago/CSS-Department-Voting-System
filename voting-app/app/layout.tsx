import type { Metadata } from 'next';
import './globals.css';
import BinaryRain from '@/components/BinaryRain';
import Interactions from '@/components/Interactions';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: 'CSS Department Voting System',
  description: 'Official student election platform for the Computer Science Department at St. Clare College of Caloocan.',
  icons: { icon: '/assets/department_logo.png' },
};

// Apply the persisted theme before first paint so the page never flashes
// between dark and light (the toggle hydrates the same value from localStorage).
const themeBootScript = `(function(){try{var s=localStorage.getItem('css-voting-theme');var t=(s==='light'||s==='dark')?s:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <div className="grid-overlay" aria-hidden="true" />
        <BinaryRain />
        {children}
        <ThemeToggle />
        <Interactions />
      </body>
    </html>
  );
}