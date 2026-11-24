import { Global, Module } from '@nestjs/common';
import { CloudinaryStorageAdapter } from './cloudinary-storage.adapter.js';
import { GoogleDriveAdapter } from './google-drive.adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [LocalStorageAdapter, GoogleDriveAdapter, CloudinaryStorageAdapter, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
