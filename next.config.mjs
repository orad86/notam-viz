/** @type {import('next').NextConfig} */
// IOS_BUILD is the pre-v0.7.4 name, kept as an alias for one release so a
// shell profile that still exports it keeps working. Remove it after v0.7.4.
const isNativeBuild =
  process.env.NATIVE_BUILD === '1' || process.env.IOS_BUILD === '1';

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['playwright'],
  },
  // The native builds (iOS and Android) ship a static bundle inside the
  // Capacitor shell and call /api/notams on the production Vercel deployment
  // over HTTPS. The route handler itself is moved aside by
  // scripts/native-build.mjs before `next build` since `output: 'export'`
  // does not emit route handlers.
  ...(isNativeBuild
    ? { output: 'export', images: { unoptimized: true }, trailingSlash: true }
    : {}),
};

export default nextConfig;
