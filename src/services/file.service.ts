import { cloudinary } from "../config/cloudinary";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { FileKind } from "@prisma/client";
import { paginate, paginationParams } from "../utils/pagination";

function resourceTypeFor(mimeType: string): "image" | "video" | "raw" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "raw"; // PDFs and other documents
}

function kindFor(mimeType: string): FileKind {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType === "application/pdf") return "PDF";
  return "OTHER";
}

function isCloudinaryConfigured(): boolean {
  return !!(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);
}

export const fileService = {
  async upload(
    uploadedById: string,
    fileBuffer: Buffer,
    meta: { originalName: string; mimeType: string; clientId?: string; folder?: string }
  ) {
    if (!isCloudinaryConfigured()) {
      throw AppError.badRequest("Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.");
    }

    const resourceType = resourceTypeFor(meta.mimeType);

    const uploadResult = await new Promise<{ secure_url: string; public_id: string; bytes: number }>(
      (resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            folder: meta.folder ? `approval-platform/${meta.folder}` : "approval-platform",
          },
          (error, result) => {
            if (error || !result) {
              console.error("[Cloudinary Upload Error]", error);
              return reject(error ?? new Error("Cloudinary upload failed"));
            }
            resolve(result as never);
          }
        );
        stream.end(fileBuffer);
      }
    );

    return prisma.file.create({
      data: {
        clientId: meta.clientId,
        uploadedById,
        kind: kindFor(meta.mimeType),
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        folder: meta.folder,
        originalName: meta.originalName,
        mimeType: meta.mimeType,
        size: uploadResult.bytes,
      },
    });
  },

  async list(filters: { clientId?: string; folder?: string; search?: string; kind?: FileKind; page?: number; limit?: number }) {
    const { page, limit, skip } = paginationParams(filters);
    const where = {
      clientId: filters.clientId,
      folder: filters.folder,
      kind: filters.kind,
      originalName: filters.search ? { contains: filters.search, mode: "insensitive" as const } : undefined,
    };

    const [items, total] = await Promise.all([
      prisma.file.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.file.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  },

  async delete(id: string) {
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) throw AppError.notFound("File not found");

    if (file.publicId) {
      const resourceType = file.kind === "IMAGE" ? "image" : file.kind === "VIDEO" ? "video" : "raw";
      await cloudinary.uploader.destroy(file.publicId, { resource_type: resourceType }).catch(() => {
        // Non-fatal: proceed with DB deletion even if the remote asset is
        // already gone or Cloudinary is temporarily unreachable.
      });
    }

    await prisma.file.delete({ where: { id } });
  },
};
