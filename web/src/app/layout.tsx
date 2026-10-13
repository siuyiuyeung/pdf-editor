import type { Metadata } from 'next';
import { Archivo_Black, Inter } from 'next/font/google';
import { Footer } from '@/components/Footer';
import { TopBar } from '@/components/TopBar';
import { SITE_NAME } from '@/site';
import './globals.css';

const display = Archivo_Black({ weight: '400', subsets: ['latin'], variable: '--font-archivo-black' });
const sans = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: `${SITE_NAME} — Free online PDF tools`,
  description: 'Merge, split, rotate, convert, sign and edit PDFs for free. Most tools run right in your browser.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <TopBar />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
