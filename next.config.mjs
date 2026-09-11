/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pure client-side app (localStorage, no backend) -> export a static site so
  // it deploys to any static host (Cloudflare Pages) with no server runtime.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
