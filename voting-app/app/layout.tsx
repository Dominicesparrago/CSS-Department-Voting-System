import type { Metadata } from 'next';
import './globals.css';
import BinaryRain from '@/components/BinaryRain';
import Interactions from '@/components/Interactions';

export const metadata: Metadata = {
  title: 'CSS Department Voting System',
  description: 'Official student election platform for the Computer Science Department at St. Clare College of Caloocan.',
  icons: { icon: '/assets/department_logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="grid-overlay" aria-hidden="true" />
        <BinaryRain />
        {children}
        <Interactions />
      </body>
    </html>
  );
}
