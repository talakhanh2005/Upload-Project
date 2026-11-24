import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryStorageAdapter } from './cloudinary-storage.adapter.js';
import { GoogleDriveAdapter } from './google-drive.adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
import type { StorageAdapter, StorageContext } from './storage.types.js';

@Injectable()
export class StorageService {
  private readonly adapter: StorageAdapter;

  constructor(config: ConfigService, private readonly local: LocalStorageAdapter, private readonly drive: GoogleDriveAdapter, private readonly cloudinary: CloudinaryStorageAdapter) {
    this.adapter = config.get('STORAGE_DRIVER') === 'google-drive' ? drive : local;
  }

  store(file: Express.Multer.File, context: StorageContext) { return this.adapter.store(file, context); }
  storeImage(file: Express.Multer.File, context: StorageContext) {
    return this.cloudinary.configured
      ? this.cloudinary.store(file, context)
      : this.adapter.store(file, context);
  }
  remove(storageKey: string) { if (storageKey.startsWith('cloudinary:')) return this.cloudinary.remove(storageKey); return storageKey.startsWith('drive:') ? this.drive.remove(storageKey) : this.local.remove(storageKey); }
  open(storageKey: string, mime: string) { if (storageKey.startsWith('cloudinary:')) return this.cloudinary.open(storageKey, mime); return storageKey.startsWith('drive:') ? this.drive.open(storageKey, mime) : this.local.open(storageKey, mime); }
  health() { return this.adapter.health(); }
  imageHealth() { return this.cloudinary.health(); }
}
