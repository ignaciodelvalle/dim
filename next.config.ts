import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PWA, image optimization, and Supabase integration config will be added here
  // as we layer in features. Keep this file minimal until then.
  experimental: {
    // Welfare denuncia evidence allows up to 5 files × 25 MB.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
