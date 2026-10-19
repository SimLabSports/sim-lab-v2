import type { Metadata } from 'next';
import './globals.css';
import './reference.css';
export const metadata: Metadata = { title: 'Sim Lab — Sports Intelligence', description: 'A clearer game. Explore independently sourced market, expert, and Green Check research perspectives.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html> }
