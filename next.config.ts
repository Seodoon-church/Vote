import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Firebase Hosting 정적 배포 (family 프로젝트 패턴) — 동적 라우트는 쿼리 파라미터 사용
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
