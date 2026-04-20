/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow fetching from external URLs in API routes
  headers: async () => {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
