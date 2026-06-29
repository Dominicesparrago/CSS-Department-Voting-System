import type { Metadata } from 'next';
import './globals.css';
import BinaryRain from '@/components/BinaryRain';
import Interactions from '@/components/Interactions';

export const metadata: Metadata = {
  title: 'CSS Department Voting System',
  description: 'Official student election platform for the Computer Science Department at St. Clare College of Caloocan.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230A0E0F'/%3E%3Cpath d='M9 17.2 13.2 21 23 10.5' fill='none' stroke='%2322B8A0' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
        />
      </head>
      <body>
        <BinaryRain />
        {children}
        <Interactions />
      </body>
    </html>
  );
}
