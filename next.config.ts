import type { NextConfig } from "next";

// Derive the Supabase hostname from the env var so local dev (127.0.0.1)
// and any custom self-hosted instance are covered automatically.
//
// Parsed once, and never with a bare `new URL()`. An unvalidated env var here
// aborts the whole build with nothing but "TypeError: Invalid URL" — no
// variable name, no value, and Vercel masks the input as [SENSITIVE] — which
// is an hour of bisecting a config file to find a misconfigured secret. The
// throw below names the variable and shows only the scheme prefix, which for a
// NEXT_PUBLIC_ URL discloses nothing that is not already in the client bundle.
function parseSupabaseUrl(raw: string): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is set but is not a valid absolute URL. Length ${raw.length}, begins ${JSON.stringify(raw.slice(0, 8))}. Expected something like https://<ref>.supabase.co — check for wrapping quotes, a trailing newline, or a missing scheme.`,
    );
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseParsed = parseSupabaseUrl(supabaseUrl);
const supabaseHostname = supabaseParsed?.hostname ?? "127.0.0.1";

// Shared by /denuncias/codigo/* and /denuncias/seguimiento/*. See the rationale
// at the `headers()` entries that use it.
const DENUNCIA_PRIVATE_HEADERS = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

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
        // Denuncia surfaces — the reference-code stub and the reporter view.
        //
        // A denuncia is an UNVERIFIED allegation of a crime that carries prison
        // (Ley 14.346 art. 1) about a person who has not been investigated yet.
        // Two headers, because page metadata alone was not enough:
        //
        //  • X-Robots-Tag. There is no robots.txt in this repo, so before this a
        //    leaked denuncia URL had nothing telling a crawler to stay away. The
        //    header (unlike `export const metadata.robots`) also covers the 303
        //    from /seguimiento/entrar and any non-HTML response on the subtree.
        //  • Referrer-Policy: no-referrer. The global policy is
        //    strict-origin-when-cross-origin, which already keeps the DEN code
        //    out of cross-origin referrers — but it still sends the FULL URL
        //    same-origin, and /seguimiento/entrar briefly holds a live access
        //    token in its query string. `no-referrer` means that URL is never
        //    quoted to anybody, including us.
        //
        // Scoped to these two paths on purpose: /denuncias and /denuncias/nueva
        // are the intake funnel and SHOULD be findable — a person searching for
        // how to report cruelty needs to land on the form.
        source: "/denuncias/codigo/:path*",
        headers: DENUNCIA_PRIVATE_HEADERS,
      },
      {
        source: "/denuncias/seguimiento/:path*",
        headers: DENUNCIA_PRIVATE_HEADERS,
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
        port: supabaseParsed?.port ?? "54321",
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
