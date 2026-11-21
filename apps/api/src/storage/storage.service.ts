import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleDriveAdapter } from './google-drive.adapter';
import { LocalStorageAdapter } from './local-storage.adapter';
import { StorageAdapter, StorageContext } from './storage.types';

@Injectable()
export class StorageService {
  private readonly adapter: StorageAdapter;

  constructor(config: ConfigService, private readonly local: LocalStorageAdapter, private readonly drive: GoogleDriveAdapter) {
    this.adapter = config.get('STORAGE_DRIVER') === 'google-drive' ? drive : local;
  }

  store(file: Express.Multer.File, context: StorageContext) { return this.adapter.store(file, context); }
  remove(storageKey: string) { return storageKey.startsWith('drive:') ? this.drive.remove(storageKey) : this.local.remove(storageKey); }
  open(storageKey: string, mime: string) { return storageKey.startsWith('drive:') ? this.drive.open(storageKey, mime) : this.local.open(storageKey, mime); }
  health() { return this.adapter.health(); }
}
