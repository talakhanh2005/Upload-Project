import { Global, Module } from '@nestjs/common';
import { GoogleDriveAdapter } from './google-drive.adapter.js';
import { LocalStorageAdapter } from './local-storage.adapter.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [LocalStorageAdapter, GoogleDriveAdapter, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
