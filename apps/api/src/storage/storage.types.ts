import { Readable } from 'node:stream';

export type StoredFile = {
  storageKey: string;
  filename: string;
  mime: string;
  sizeBytes: number;
};

export type StorageContext = {
  courseName: string;
  assignmentName: string;
  studentName: string;
};

export type OpenedFile = {
  stream: Readable;
  mime: string;
};

export interface StorageAdapter {
  store(file: Express.Multer.File, context: StorageContext): Promise<StoredFile>;
  remove(storageKey: string): Promise<void>;
  open(storageKey: string, mime: string): Promise<OpenedFile>;
  health(): Promise<{ driver: string; connected: boolean; detail?: string }>;
}
