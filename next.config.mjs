/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pure client-side app (localStorage, no backend) -> export a static site so
  // it deploys to any static host (Cloudflare Pages) with no server runtime.
  output: "export",
  // The app lives under /app; the root of mylifesense.app is the marketing site.
  basePath: "/app",
  images: { unoptimized: true },
};

export default nextConfig;
