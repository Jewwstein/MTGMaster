import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { promises as fs } from "fs";
import path from "path";
import prisma from "../../../lib/prisma";
import { authOptions } from "../../../lib/auth";

const UPLOAD_DIR = path.join(process.cwd(), "public", "playmats", "uploads");

const PRESETS = [
  {
    slug: "aurora-dawn",
    name: "Aurora Dawn",
    filePath: "/playmats/preset-aurora.svg",
    previewPath: "/playmats/preset-aurora.svg",
  },
];

type PlaymatDto = {
  id: string;
  name: string;
  slug: string;
  filePath: string;
  previewPath: string | null;
  isPreset: boolean;
};

async function ensurePresets() {
  await Promise.all(
    PRESETS.map((preset) =>
      prisma.playmat.upsert({
        where: { slug: preset.slug },
        update: {
          name: preset.name,
          filePath: preset.filePath,
          previewPath: preset.previewPath,
          isPreset: true,
        },
        create: {
          name: preset.name,
          slug: preset.slug,
          filePath: preset.filePath,
          previewPath: preset.previewPath,
          isPreset: true,
        },
      }),
    ),
  );
}

function toDto(playmat: { id: string; name: string; slug: string; filePath: string; previewPath: string | null; isPreset: boolean }): PlaymatDto {
  return {
    id: playmat.id,
    name: playmat.name,
    slug: playmat.slug,
    filePath: playmat.filePath,
    previewPath: playmat.previewPath,
    isPreset: playmat.isPreset,
  };
}

export async function GET() {
  try {
    await ensurePresets();
    const playmats = await prisma.playmat.findMany({
      orderBy: [
        { isPreset: "desc" },
        { createdAt: "desc" },
      ],
    });
    return NextResponse.json({ playmats: playmats.map(toDto) });
  } catch (error) {
    console.error("GET /api/playmats failed", error);
    return NextResponse.json({ error: "Failed to load playmats" }, { status: 500 });
  }
}

function generateSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : `playmat-${suffix}`;
}

async function saveFile(file: File, slug: string) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = (() => {
    const fromName = path.extname(file.name || "").toLowerCase();
    if (fromName) return fromName;
    if (file.type === "image/png") return ".png";
    if (file.type === "image/jpeg") return ".jpg";
    if (file.type === "image/webp") return ".webp";
    if (file.type === "image/svg+xml") return ".svg";
    return ".img";
  })();
  const filename = `${slug}${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  const arrayBuffer = await file.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));
  const publicPath = `/playmats/uploads/${filename}`;
  return { filePath: publicPath, previewPath: publicPath };
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const nameInput = form.get("name");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!file.type.startsWith("image/") && file.type !== "image/svg+xml") {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (10MB max)" }, { status: 400 });
    }

    const name = typeof nameInput === "string" && nameInput.trim() ? nameInput.trim() : file.name.replace(/\.[^.]+$/,"") || "Custom Playmat";
    const slug = generateSlug(name);
    const paths = await saveFile(file, slug);

    let ownerId: string | null = null;
    if (userId) {
      const existingUser = await prisma.user.findUnique({ where: { id: userId } });
      if (existingUser) ownerId = existingUser.id;
    }

    const created = await prisma.playmat.create({
      data: {
        name,
        slug,
        filePath: paths.filePath,
        previewPath: paths.previewPath,
        uploadedById: ownerId,
        isPreset: false,
      },
    });

    return NextResponse.json({ playmat: toDto(created) });
  } catch (error) {
    console.error("POST /api/playmats failed", error);
    return NextResponse.json({ error: "Failed to upload playmat" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
