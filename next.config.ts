import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Allow Server Actions to be invoked from these origins during dev so the
  // phone can hit http://192.168.1.240:3000 without Next.js rejecting the
  // request with an Origin / Server-Action security check.
  allowedDevOrigins: ["192.168.1.240", "192.168.137.1", "192.168.127.111"],
  experimental: {
    serverActions: {
      // Incident/fault photos are compressed client-side to small JPEGs, but a
      // few of them together can still exceed the 1 MB default. Raise the limit
      // so reports with photos submit reliably.
      bodySizeLimit: "10mb",
    },
    // Client-side Router Cache: reuse a page's rendered payload for a short
    // window so clicking back to a screen you just viewed is instant instead of
    // re-fetching from the server (Supabase sits in Paris — every round-trip
    // costs). Mutations still call revalidatePath, which busts the cache.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
