import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

/** Shards as `ab/cd/<sha256><ext>` to keep any one directory small. */
export function shardedPath(sha256: string, ext: string): string {
  return `${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}${ext}`;
}
