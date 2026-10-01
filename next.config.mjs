/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Inlined at build time (client + server). Production builds never show
    // the built-in demo agents/tasks — see src/lib/demo-policy.ts.
    NEXT_PUBLIC_PT_DEMO_DATA:
      process.env.VERCEL_ENV === "production" ? "off" : "on",
  },
};

export default nextConfig;
