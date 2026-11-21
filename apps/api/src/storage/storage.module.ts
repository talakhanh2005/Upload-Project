import { Global, Module } from '@nestjs/common';
import { GoogleDriveAdapter } from './google-drive.adapter';
import { LocalStorageAdapter } from './local-storage.adapter';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [LocalStorageAdapter, GoogleDriveAdapter, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
