/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Disable Router Cache for dynamic pages (prevents React state from being
    // restored on back-navigation without re-running useEffect/re-fetching data)
    staleTimes: {
      dynamic: 0,
    },
  },
};
module.exports = nextConfig;
