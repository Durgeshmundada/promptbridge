declare module 'yazl' {
  import type { Readable } from 'node:stream';

  export interface AddFileOptions {
    mtime?: Date;
    mode?: number;
  }

  export class ZipFile {
    outputStream: Readable;
    addFile(path: string, metadataPath: string, options?: AddFileOptions): void;
    end(): void;
  }
}
