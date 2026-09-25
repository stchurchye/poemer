import { existsSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const packageDir = process.cwd();
const manifest = resolve(packageDir, 'package.json');
const dist = resolve(packageDir, 'dist');
const buildInfo = resolve(packageDir, 'tsconfig.tsbuildinfo');

if (!existsSync(manifest) || dirname(dist) !== packageDir || basename(dist) !== 'dist') {
  throw new Error(`REFUSE_UNSAFE_DIST_CLEAN:${dist}`);
}

rmSync(dist, { recursive: true, force: true });
rmSync(buildInfo, { force: true });
