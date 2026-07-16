import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ClientLayout } from './layout-client';

// Police principale de toute l'application (remplace 'Geist' qui n'était en
// réalité jamais chargée — voir --font-sans dans globals.css).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Police à chasse fixe (SKU, numéros masqués, codes...) — remplace 'Geist Mono'.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SoftCosy',
  description: 'Gestion des stocks et inventaires',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}