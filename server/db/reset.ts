import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  rmSync(path.join(here, `library.db${suffix}`), { force: true });
}
rmSync(path.join(here, '..', 'media'), { recursive: true, force: true });

// Importing rebuilds the schema and the media directories from scratch.
await import('./index.ts');
console.log('Database and media store reset.');
