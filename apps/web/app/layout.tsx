import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Covers',
  description: 'Compliance checks for speaker dinners, enforced at the company card.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
