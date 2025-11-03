-- CreateTable
CREATE TABLE "Playmat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "previewPath" TEXT,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Playmat_slug_key" UNIQUE ("slug"),
    CONSTRAINT "Playmat_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Playmat_slug_key" ON "Playmat"("slug");
