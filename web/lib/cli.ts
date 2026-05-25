import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// uv 경로 — 플랫폼별 분기. UV_PATH 환경변수로 override 가능.
const UV_PATH =
  process.env.UV_PATH ||
  (process.platform === "win32"
    ? path.join(process.env.USERPROFILE || "C:\\Users\\User", ".local", "bin", "uv.exe")
    : path.join(process.env.HOME || "/home/ubuntu", ".local", "bin", "uv"));

// crawler 프로젝트 루트 (web/ 의 한 단계 위)
const PROJECT_DIR = path.join(process.cwd(), "..");

export async function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(
    UV_PATH,
    ["run", "python", "-m", "crawler.run", ...args],
    {
      cwd: PROJECT_DIR,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      maxBuffer: 10 * 1024 * 1024,
    }
  );
  return { stdout: stdout.toString(), stderr: stderr.toString() };
}

export async function refreshDump(): Promise<void> {
  await runCli(["dump-json"]);
}
