import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { cloudinary, configureCloudinary } from "./cloudinary-client.js";
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
  private readonly folderRoot: string;

  constructor(config: ConfigService) {
    this.configured = configureCloudinary(
      config.get<string>("CLOUDINARY_URL"),
    );
    const defaultEnvironment =
      config.get<string>("NODE_ENV") === "production"
        ? "production"
        : "development";
    this.folderRoot = this.safePath(
      config.get<string>("CLOUDINARY_FOLDER") ??
        `upload-system/${defaultEnvironment}`,
    );
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
        folder: `${this.folderRoot}/exercises/${this.safeSegment(context.courseName)}`,
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
    if (!this.configured) {
      return {
        driver: "cloudinary",
        connected: false,
        detail: "CLOUDINARY_URL is missing or invalid",
      };
    }

    try {
      await cloudinary.api.ping();
      return {
        driver: "cloudinary",
        connected: true,
        detail: `folder=${this.folderRoot}`,
      };
    } catch {
      return {
        driver: "cloudinary",
        connected: false,
        detail: "Cloudinary credentials could not be verified",
      };
    }
  }

  private safePath(value: string) {
    const path = value
      .split("/")
      .map((segment) => this.safeSegment(segment))
      .filter(Boolean)
      .join("/");
    return path || "upload-system/development";
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
