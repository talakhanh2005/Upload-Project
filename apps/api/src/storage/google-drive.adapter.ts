import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, drive_v3 } from 'googleapis';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { OpenedFile, StorageAdapter, StorageContext, StoredFile } from './storage.types.js';

@Injectable()
export class GoogleDriveAdapter implements StorageAdapter {
  private readonly drive: drive_v3.Drive;
  private readonly rootFolderId: string;

  constructor(private readonly config: ConfigService) {
    const clientId = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
    const refreshToken = config.get<string>('GOOGLE_REFRESH_TOKEN');
    this.rootFolderId = config.get<string>('GOOGLE_DRIVE_ROOT_FOLDER_ID') ?? '';
    const oauth = new google.auth.OAuth2(clientId, clientSecret);
    oauth.setCredentials({ refresh_token: refreshToken });
    this.drive = google.drive({ version: 'v3', auth: oauth });
  }

  private assertConfigured() {
    const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_DRIVE_ROOT_FOLDER_ID'];
    const missing = required.filter((key) => !this.config.get<string>(key));
    if (missing.length) throw new ServiceUnavailableException(`Google Drive is not configured: ${missing.join(', ')}`);
  }

  private safeFolderName(value: string) {
    return Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return character === '\\' || character === '/' || code <= 31 ? '_' : character;
    }).join('').trim().slice(0, 120) || 'Untitled';
  }

  private async ensureFolder(name: string, parentId: string) {
    const safeName = this.safeFolderName(name);
    const escapedName = safeName.replace(/'/g, "\\'");
    const result = await this.drive.files.list({
      q: `'${parentId}' in parents and name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id,name)',
      pageSize: 1,
    });
    const existing = result.data.files?.[0]?.id;
    if (existing) return existing;
    const created = await this.drive.files.create({
      requestBody: { name: safeName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    if (!created.data.id) throw new Error(`Could not create Drive folder ${safeName}`);
    return created.data.id;
  }

  async store(file: Express.Multer.File, context: StorageContext): Promise<StoredFile> {
    this.assertConfigured();
    let uploadedId: string | undefined;
    try {
      const courseFolder = await this.ensureFolder(context.courseName, this.rootFolderId);
      const assignmentFolder = await this.ensureFolder(context.assignmentName, courseFolder);
      const studentFolder = await this.ensureFolder(context.studentName, assignmentFolder);
      const result = await this.drive.files.create({
        requestBody: { name: file.originalname, parents: [studentFolder] },
        media: { mimeType: file.mimetype, body: createReadStream(file.path) },
        fields: 'id,name,size,mimeType',
      });
      uploadedId = result.data.id ?? undefined;
      if (!uploadedId) throw new Error('Google Drive returned no file ID');
      return {
        storageKey: `drive:${uploadedId}`,
        filename: result.data.name ?? file.originalname,
        mime: result.data.mimeType ?? file.mimetype,
        sizeBytes: Number(result.data.size ?? file.size),
      };
    } catch (error) {
      if (uploadedId) await this.drive.files.delete({ fileId: uploadedId }).catch(() => undefined);
      throw error;
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  async remove(storageKey: string) {
    if (!storageKey.startsWith('drive:')) return;
    this.assertConfigured();
    await this.drive.files.delete({ fileId: storageKey.slice(6) }).catch((error: { code?: number }) => {
      if (error.code !== 404) throw error;
    });
  }

  async open(storageKey: string, mime: string): Promise<OpenedFile> {
    this.assertConfigured();
    if (!storageKey.startsWith('drive:')) throw new Error('Not a Google Drive storage key');
    const response = await this.drive.files.get(
      { fileId: storageKey.slice(6), alt: 'media' },
      { responseType: 'stream' },
    );
    return { stream: response.data as Readable, mime };
  }

  async health() {
    try {
      this.assertConfigured();
      await this.drive.files.get({ fileId: this.rootFolderId, fields: 'id,name,trashed' });
      return { driver: 'google-drive', connected: true };
    } catch (error) {
      return { driver: 'google-drive', connected: false, detail: error instanceof Error ? error.message : 'Unknown Drive error' };
    }
  }
}
