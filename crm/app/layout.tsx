import type { Metadata } from 'next';
import './globals.css';
import Toaster from '@/components/Toaster';

export const metadata: Metadata = {
  title: 'TKBS CRM',
  description: 'Internal CRM for TKBS Marketing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
