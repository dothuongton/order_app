import { rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const at = path => fileURLToPath(new URL(path, root));
// Clean generated output so repeat builds cannot retain old tests/migrations.
rmSync(at('dist'), { recursive: true, force: true });
execFileSync(process.execPath, [at('node_modules/typescript/bin/tsc')], { cwd: fileURLToPath(root), stdio: 'inherit' });
cpSync(at('src/db/schema.sql'), at('dist/db/schema.sql'));
cpSync(at('src/db/migrations'), at('dist/db/migrations'), { recursive: true });
