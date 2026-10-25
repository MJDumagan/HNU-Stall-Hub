const configuredBackendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
const backendUrl = configuredBackendUrl.includes('://')
  ? configuredBackendUrl
  : `https://${configuredBackendUrl}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
