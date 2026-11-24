import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type {
  OpenedFile,
  StorageAdapter,
  StorageContext,
  StoredFile,
} from "./storage.types.js";

const PREFIX = "cloudinary:image:";

@Injectable()
export class CloudinaryStorageAdapter implements StorageAdapter {
  readonly configured: boolean;

  constructor(config: ConfigService) {
    this.configured = Boolean(config.get<string>("CLOUDINARY_URL"));
    cloudinary.config({ secure: true });
  }

  private assertConfigured() {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        "Cloudinary image storage is not configured. Set CLOUDINARY_URL.",
      );
    }
  }

  async store(
    file: Express.Multer.File,
    context: StorageContext,
  ): Promise<StoredFile> {
    this.assertConfigured();
    try {
      const uploaded = await cloudinary.uploader.upload(file.path, {
        resource_type: "image",
        folder: `upload-system/exercises/${this.safeSegment(context.courseName)}`,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
      });
      return {
        storageKey: `${PREFIX}${uploaded.public_id}`,
        filename: file.originalname,
        mime: file.mimetype,
        sizeBytes: uploaded.bytes,
      };
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  async remove(storageKey: string) {
    if (!storageKey.startsWith(PREFIX)) return;
    this.assertConfigured();
    await cloudinary.uploader.destroy(storageKey.slice(PREFIX.length), {
      resource_type: "image",
      invalidate: true,
    });
  }

  async open(storageKey: string, mime: string): Promise<OpenedFile> {
    if (!storageKey.startsWith(PREFIX)) {
      throw new Error("Not a Cloudinary image key");
    }
    this.assertConfigured();
    const publicId = storageKey.slice(PREFIX.length);
    const response = await fetch(
      cloudinary.url(publicId, { resource_type: "image", secure: true }),
    );
    if (!response.ok || !response.body) {
      throw new ServiceUnavailableException("Cloudinary image is unavailable");
    }
    return {
      stream: Readable.fromWeb(response.body as unknown as NodeReadableStream),
      mime: response.headers.get("content-type") ?? mime,
    };
  }

  async health() {
    return {
      driver: "cloudinary",
      connected: this.configured,
      detail: this.configured ? undefined : "CLOUDINARY_URL is missing",
    };
  }

  private safeSegment(value: string) {
    return (
      value
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "course"
    );
  }
}
