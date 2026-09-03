import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'ARKON ND Extractor', description: 'Extracción documental exhaustiva ND' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
