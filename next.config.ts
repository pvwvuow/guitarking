import type { NextConfig } from "next";

/* STATIC_EXPORT=1 → GitHub Pages build: plain static files in ./out,
   no server (hash routing keeps working; the pages build moves
   src/app/api aside). Asset references in src/ are relative
   (posters/…, demo/…) so the same tree serves at site root (VPS)
   and under /guitarking/ (pvwvuow.github.io). */
const isStatic = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isStatic ? "export" : "standalone",
  /* project pages URL is pvwvuow.github.io/guitarking/ — Next's own
     JS/CSS need the prefix; relative asset refs in src/ are unaffected */
  basePath: isStatic ? "/guitarking" : undefined,
  images: { unoptimized: isStatic },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
