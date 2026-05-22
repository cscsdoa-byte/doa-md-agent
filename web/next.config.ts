import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";

// 상위 폴더의 .env (doa-md-agent/.env) 를 Next.js 서버 측에서 사용 가능하게.
// SETTLE_API_TOKEN, SETTLE_BASE_URL 등을 한 곳에서 관리하기 위함.
loadEnv({ path: "../.env" });

// 배포 시 nginx 가 /md/ 서브경로로 리버스 프록시. production 빌드에만 basePath 적용.
// dev (localhost:3000) 에선 / 그대로 — 평소 작업 흐름 유지.
const useBasePath = process.env.NODE_ENV === "production" || process.env.MD_BASE_PATH === "1";

const nextConfig: NextConfig = {
  ...(useBasePath ? { basePath: "/md", assetPrefix: "/md" } : {}),
};

export default nextConfig;
