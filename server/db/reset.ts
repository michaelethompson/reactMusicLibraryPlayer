import { rmSync } from 'node:fs';
import path from 'node:path';
import { DB_PATH, MEDIA_ROOT, ORIGINALS_ROOT, UPLOAD_TMP } from '../config.ts';

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  rmSync(`${DB_PATH}${suffix}`, { force: true });
}
for (const dir of [MEDIA_ROOT, UPLOAD_TMP, ORIGINALS_ROOT]) {
  rmSync(dir, { recursive: true, force: true });
}

// Importing rebuilds the schema and the media directories from scratch.
await import('./index.ts');
console.log(`Reset ${path.dirname(DB_PATH)} and the media store.`);
