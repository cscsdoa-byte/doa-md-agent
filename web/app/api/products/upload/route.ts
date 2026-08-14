/**
 * /api/products/upload — 상품 이미지 파일 업로드.
 *
 * POST  ?product=두쫀모
 *   multipart/form-data, field 'file' (image/*)
 *   → web/public/uploads/{product}/{timestamp}_{name} 저장
 *   → { url: "/uploads/{product}/{timestamp}_{name}" } 반환 (Next.js 정적 서빙)
 *
 * UI에서 반환된 url을 main_image 또는 detail_images에 PATCH 로 박는다.
 */
import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";

const PUBLIC_UPLOADS = join(process.cwd(), "public", "uploads");

// 파일 이름 안전화 — 한글/특수문자 그대로 두면 URL 인코딩 이슈, 영문/숫자/일부만 허용
function safeName(name: string): string {
  const ext = extname(name).toLowerCase();
  const base = name
    .slice(0, name.length - ext.length)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 40) || "img";
  return `${base}${ext || ".jpg"}`;
}

export async function POST(request: NextRequest) {
  const product = request.nextUrl.searchParams.get("product");
  if (!product) {
    return NextResponse.json({ error: "?product=<이름> 필요" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "multipart 형식 필요" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file 필드 필요" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: `이미지 파일만 가능 (현재: ${file.type})` }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "10MB 이하만" }, { status: 400 });
  }

  const productDir = join(PUBLIC_UPLOADS, product);
  await mkdir(productDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${ts}_${safeName(file.name)}`;
  const fullPath = join(productDir, filename);

  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buf);

  const url = `/uploads/${encodeURIComponent(product)}/${filename}`;
  return NextResponse.json({ ok: true, url });
}
