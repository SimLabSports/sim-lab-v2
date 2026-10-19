import type { NextConfig } from 'next';
const config: NextConfig = { devIndicators: false, outputFileTracingRoot: process.cwd(), distDir: process.env.NODE_ENV==='development'?'.next-dev':'.next' };
export default config;
