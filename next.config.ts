import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compiler: {
    styledComponents: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gtiivfj57h.ufs.sh',
      },
    ],
  },
};

export default nextConfig;
