import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function getTestFiles() {
  const testDir = join(process.cwd(), 'backend', 'server', 'tests');
  const entries = readdirSync(testDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => join('backend', 'server', 'tests', entry.name))
    .sort();
}

function shouldUseNoIsolation() {
  const major = Number(process.versions.node.split('.')[0] || 0);
  if (Number.isNaN(major) || major < 24) return false;
  return process.platform === 'win32';
}

const nodeArgs = ['--env-file-if-exists=.env', '--test'];
if (shouldUseNoIsolation()) {
  nodeArgs.push('--test-isolation=none');
}
nodeArgs.push(...getTestFiles());

const result = spawnSync(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
  },
});
process.exit(result.status ?? 1);
