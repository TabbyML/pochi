import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import SearchDialog from './components/search';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://docs.getpochi.com"
  ),
};


const inter = Inter({
  subsets: ['latin'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider
        search={{
          SearchDialog,
        }}
        >
        {children}</RootProvider>
      </body>
    </html>
  );
}
