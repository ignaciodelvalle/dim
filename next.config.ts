import type { NextConfig } from "next";

// Derive the Supabase hostname from the env var so local dev (127.0.0.1)
// and any custom self-hosted instance are covered automatically.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : "127.0.0.1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
        ],
      },
      {
        // Panorama basemap GeoJSON (public/geo/*) is immutable PER DEPLOY (see
        // components/panorama/geojson-cache.ts) but the filenames are NOT
        // content-hashed/versioned — so `immutable` would be wrong (a new
        // deploy reuses the same URL for changed content). 1 day + SWR lets
        // repeat visits skip the round-trip within a deploy's lifetime while
        // still revalidating well before a typical deploy cadence (perf sweep
        // P3, 2026-08-02).
        source: "/geo/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      // Local Supabase (127.0.0.1:54321) and any self-hosted instance derived
      // from NEXT_PUBLIC_SUPABASE_URL.
      {
        protocol: "http",
        hostname: supabaseHostname,
        port: supabaseUrl ? new URL(supabaseUrl).port : "54321",
        pathname: "/storage/v1/object/**",
      },
      // Production Supabase projects (*.supabase.co).
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  experimental: {
    // Welfare denuncia evidence allows up to 5 files × 25 MB.
    serverActions: {
      bodySizeLimit: "50mb",
    },
    optimizePackageImports: ["lucide-react", "recharts", "maplibre-gl"],
  },
};

export default nextConfig;
