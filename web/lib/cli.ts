import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// uv 경로는 환경에 따라 다를 수 있음 — .local\bin 기본
const UV_PATH =
  process.env.UV_PATH ||
  path.join(process.env.USERPROFILE || "C:\\Users\\User", ".local", "bin", "uv.exe");

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
