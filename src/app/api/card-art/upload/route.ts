import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

const UPLOAD_DIR = path.join(process.cwd(), "public", "card-art", "uploads");
const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

function generateFilename(originalName: string | undefined, mime: string) {
  const safeName = (originalName ?? "card-art")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  const base = safeName ? `${safeName}-${suffix}` : `card-art-${suffix}`;
  const extFromName = originalName ? path.extname(originalName).toLowerCase() : "";
  if (extFromName) return `${base}${extFromName}`;
  if (mime === "image/png") return `${base}.png`;
  if (mime === "image/jpeg") return `${base}.jpg`;
  if (mime === "image/webp") return `${base}.webp`;
  if (mime === "image/gif") return `${base}.gif`;
  if (mime === "image/svg+xml") return `${base}.svg`;
  return `${base}.img`;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (6MB max)" }, { status: 400 });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const filename = generateFilename(file.name, file.type);
    const filePath = path.join(UPLOAD_DIR, filename);
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    const publicPath = `/card-art/uploads/${filename}`;
    return NextResponse.json({ imagePath: publicPath });
  } catch (error) {
    console.error("POST /api/card-art/upload failed", error);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}
