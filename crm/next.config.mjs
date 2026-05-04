/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Mirrors the Dashboard's security headers so the cloud-deployed CRM has
  // the same baseline hardening (HSTS, frame-deny, content-type sniffing
  // off, etc.). Netlify also injects its own headers via netlify.toml; both
  // layers are belt-and-suspenders.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
