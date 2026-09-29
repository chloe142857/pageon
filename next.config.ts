import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // PDF는 최대 10MB로 제한하되 multipart 오버헤드를 고려해 약간의 여유를 둔다.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
