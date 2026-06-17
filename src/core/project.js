// @ts-check
import { spawnSync } from 'node:child_process';

export function projectDir() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout) {
    const top = r.stdout.trim();
    if (top) {
      return top;
    }
  }
  return process.cwd();
}
