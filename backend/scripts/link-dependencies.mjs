import { existsSync, lstatSync, realpathSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const backend = fileURLToPath(new URL('../', import.meta.url));
const target = path.resolve(backend, '../frontend/node_modules');
const link = path.join(backend, 'node_modules');
if (!existsSync(target)) throw new Error('Install dependencies in frontend first.');
if (existsSync(link)) {
  if (!lstatSync(link).isSymbolicLink() || realpathSync(link) !== realpathSync(target)) {
    throw new Error('backend/node_modules already exists and is not the expected dependency link.');
  }
} else {
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}
console.log('Backend dependency link is ready.');
