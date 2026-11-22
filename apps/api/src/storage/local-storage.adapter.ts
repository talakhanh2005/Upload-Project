import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import type { OpenedFile, StorageAdapter, StorageContext, StoredFile } from './storage.types.js';

@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  async store(file: Express.Multer.File, _context: StorageContext): Promise<StoredFile> {
    return {
      storageKey: `local:${file.path}`,
      filename: file.originalname,
      mime: file.mimetype,
      sizeBytes: file.size,
    };
  }

  async remove(storageKey: string) {
    const path = storageKey.startsWith('local:') ? storageKey.slice(6) : storageKey;
    await unlink(path).catch(() => undefined);
  }

  async open(storageKey: string, mime: string): Promise<OpenedFile> {
    const path = storageKey.startsWith('local:') ? storageKey.slice(6) : storageKey;
    return { stream: createReadStream(path), mime };
  }

  async health() {
    return { driver: 'local', connected: true };
  }
}
