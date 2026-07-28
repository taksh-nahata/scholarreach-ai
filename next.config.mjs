/** @type {import('next').NextConfig} */
const isStatic = process.env.STATIC_EXPORT === "true";
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] || "scholarreach-ai";

const nextConfig = {
  ...(isStatic
    ? {
        output: "export",
        basePath: process.env.BASE_PATH || `/${repo}`,
        assetPrefix: process.env.BASE_PATH || `/${repo}`,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
