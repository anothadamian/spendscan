import type { Metadata } from 'next';
import './globals.css';
import './fun-theme.css';
export const metadata: Metadata = { title: 'SpendScan — Kenali pengeluaranmu', description: 'Catat pengeluaran, temukan kebiasaan, dan lihat cerita di balik setiap transaksi.' };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="id"><body>{children}</body></html> }
