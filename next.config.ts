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
  },
};

export default nextConfig;
