import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'Image Compressor',
  description: 'Compress images in your browser — JPG, WebP, AVIF, HEIC. No uploads. No servers.',
  metadataBase: new URL('https://your-domain.vercel.app'),
  openGraph: {
    title: 'Image Compressor',
    description: 'Compress images in your browser. Batch processing, ZIP download. Files never leave your device.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
