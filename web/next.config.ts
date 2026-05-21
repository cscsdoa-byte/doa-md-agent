import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";

// 상위 폴더의 .env (doa-md-agent/.env) 를 Next.js 서버 측에서 사용 가능하게.
// SETTLE_API_TOKEN, SETTLE_BASE_URL 등을 한 곳에서 관리하기 위함.
loadEnv({ path: "../.env" });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
