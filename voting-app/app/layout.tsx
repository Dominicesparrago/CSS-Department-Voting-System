import type { Metadata } from 'next';
import { Figtree, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import BinaryRain from '@/components/BinaryRain';
import Interactions from '@/components/Interactions';

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-figtree',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CSS Department Voting System',
  description: 'Official student election platform for the Computer Science Department at St. Clare College of Caloocan.',
  icons: { icon: '/assets/department_logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${jetBrainsMono.variable}`}>
      <body>
        <div className="grid-overlay" aria-hidden="true" />
        <BinaryRain />
        {children}
        <Interactions />
      </body>
    </html>
  );
}
