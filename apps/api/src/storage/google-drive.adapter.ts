import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { google, drive_v3 } from "googleapis";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import type {
  OpenedFile,
  StorageAdapter,
  StorageContext,
  StoredFile,
} from "./storage.types.js";

@Injectable()
export class GoogleDriveAdapter implements StorageAdapter {
  private readonly rootFolderId: string;
  private readonly authMode: string;

  constructor(private readonly config: ConfigService) {
    this.rootFolderId = config.get<string>("GOOGLE_DRIVE_ROOT_FOLDER_ID") ?? "";
    this.authMode = config.get<string>("GOOGLE_DRIVE_AUTH_MODE") ?? "oauth";
  }

  private requiredKeys() {
    return this.authMode === "workspace-delegation"
      ? [
          "GOOGLE_SERVICE_ACCOUNT_EMAIL",
          "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
          "GOOGLE_WORKSPACE_DOMAIN",
        ]
      : [
          "GOOGLE_CLIENT_ID",
          "GOOGLE_CLIENT_SECRET",
          "GOOGLE_REFRESH_TOKEN",
          "GOOGLE_DRIVE_ROOT_FOLDER_ID",
        ];
  }

  private assertConfigured() {
    const required = this.requiredKeys();
    const missing = required.filter((key) => !this.config.get<string>(key));
    if (missing.length)
      throw new ServiceUnavailableException(
        `Google Drive is not configured: ${missing.join(", ")}`,
      );
  }

  private driveFor(teacherEmail?: string) {
    this.assertConfigured();
    if (this.authMode === "workspace-delegation") {
      const domain = this.config
        .get<string>("GOOGLE_WORKSPACE_DOMAIN")!
        .toLowerCase();
      const subject = (
        teacherEmail ?? this.config.get<string>("GOOGLE_WORKSPACE_ADMIN_EMAIL")
      )?.toLowerCase();
      if (!subject || !subject.endsWith(`@${domain}`)) {
        throw new ServiceUnavailableException(
          `A Google Workspace account in @${domain} is required`,
        );
      }
      const auth = new google.auth.JWT({
        email: this.config.get<string>("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
        key: this.config
          .get<string>("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")!
          .replace(/\\n/g, "\n"),
        scopes: ["https://www.googleapis.com/auth/drive.file"],
        subject,
      });
      return google.drive({ version: "v3", auth });
    }
    const oauth = new google.auth.OAuth2(
      this.config.get<string>("GOOGLE_CLIENT_ID"),
      this.config.get<string>("GOOGLE_CLIENT_SECRET"),
    );
    oauth.setCredentials({
      refresh_token: this.config.get<string>("GOOGLE_REFRESH_TOKEN"),
    });
    return google.drive({ version: "v3", auth: oauth });
  }

  private safeFolderName(value: string) {
    return (
      Array.from(value, (character) => {
        const code = character.charCodeAt(0);
        return character === "\\" || character === "/" || code <= 31
          ? "_"
          : character;
      })
        .join("")
        .trim()
        .slice(0, 120) || "Untitled"
    );
  }

  private async ensureFolder(
    drive: drive_v3.Drive,
    name: string,
    parentId: string,
  ) {
    const safeName = this.safeFolderName(name);
    const escapedName = safeName.replace(/'/g, "\\'");
    const result = await drive.files.list({
      q: `'${parentId}' in parents and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id,name)",
      pageSize: 1,
    });
    const existing = result.data.files?.[0]?.id;
    if (existing) return existing;
    const created = await drive.files.create({
      requestBody: {
        name: safeName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      },
      fields: "id",
    });
    if (!created.data.id)
      throw new Error(`Could not create Drive folder ${safeName}`);
    return created.data.id;
  }

  async store(
    file: Express.Multer.File,
    context: StorageContext,
  ): Promise<StoredFile> {
    const drive = this.driveFor(context.teacherEmail);
    let uploadedId: string | undefined;
    try {
      const rootFolder =
        this.authMode === "workspace-delegation"
          ? await this.ensureFolder(drive, "Student Uploads", "root")
          : this.rootFolderId;
      const courseFolder = await this.ensureFolder(
        drive,
        context.courseName,
        rootFolder,
      );
      const assignmentFolder = await this.ensureFolder(
        drive,
        context.assignmentName,
        courseFolder,
      );
      const studentFolder = await this.ensureFolder(
        drive,
        context.studentName,
        assignmentFolder,
      );
      const result = await drive.files.create({
        requestBody: { name: file.originalname, parents: [studentFolder] },
        media: { mimeType: file.mimetype, body: createReadStream(file.path) },
        fields: "id,name,size,mimeType",
      });
      uploadedId = result.data.id ?? undefined;
      if (!uploadedId) throw new Error("Google Drive returned no file ID");
      return {
        storageKey:
          this.authMode === "workspace-delegation" && context.teacherEmail
            ? `drive:${Buffer.from(context.teacherEmail.toLowerCase()).toString("base64url")}:${uploadedId}`
            : `drive:${uploadedId}`,
        filename: result.data.name ?? file.originalname,
        mime: result.data.mimeType ?? file.mimetype,
        sizeBytes: Number(result.data.size ?? file.size),
      };
    } catch (error) {
      if (uploadedId)
        await drive.files.delete({ fileId: uploadedId }).catch(() => undefined);
      throw error;
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  async remove(storageKey: string) {
    if (!storageKey.startsWith("drive:")) return;
    const { fileId, teacherEmail } = this.parseStorageKey(storageKey);
    const drive = this.driveFor(teacherEmail);
    await drive.files.delete({ fileId }).catch((error: { code?: number }) => {
      if (error.code !== 404) throw error;
    });
  }

  async open(storageKey: string, mime: string): Promise<OpenedFile> {
    if (!storageKey.startsWith("drive:"))
      throw new Error("Not a Google Drive storage key");
    const { fileId, teacherEmail } = this.parseStorageKey(storageKey);
    const response = await this.driveFor(teacherEmail).files.get(
      { fileId, alt: "media" },
      { responseType: "stream" },
    );
    return { stream: response.data as Readable, mime };
  }

  async health() {
    try {
      const drive = this.driveFor();
      if (this.authMode === "workspace-delegation") {
        await drive.files.list({ pageSize: 1, fields: "files(id)" });
      } else {
        await drive.files.get({
          fileId: this.rootFolderId,
          fields: "id,name,trashed",
        });
      }
      return { driver: "google-drive", connected: true, detail: this.authMode };
    } catch (error) {
      return {
        driver: "google-drive",
        connected: false,
        detail: error instanceof Error ? error.message : "Unknown Drive error",
      };
    }
  }

  private parseStorageKey(storageKey: string) {
    const parts = storageKey.split(":");
    if (parts.length === 2)
      return { fileId: parts[1], teacherEmail: undefined };
    if (parts.length === 3) {
      return {
        fileId: parts[2],
        teacherEmail: Buffer.from(parts[1], "base64url").toString("utf8"),
      };
    }
    throw new Error("Invalid Google Drive storage key");
  }
}
