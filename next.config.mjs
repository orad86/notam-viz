/** @type {import('next').NextConfig} */
const isIosBuild = process.env.IOS_BUILD === '1';

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['playwright'],
  },
  // The iOS build ships a static bundle inside the Capacitor shell and calls
  // /api/notams on the production Vercel deployment over HTTPS. The route
  // handler itself is moved aside by scripts/ios-build.mjs before `next build`
  // since `output: 'export'` does not emit route handlers.
  ...(isIosBuild
    ? { output: 'export', images: { unoptimized: true }, trailingSlash: true }
    : {}),
};

export default nextConfig;
