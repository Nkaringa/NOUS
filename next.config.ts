import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // typedRoutes: true,  // dynamic /notes/[id] + /chat/[id] make this noisy
};

export default config;
