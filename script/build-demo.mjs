import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const distDir = 'dist';
const demoDir = 'demo';

try {
  fs.rmSync(distDir, { recursive: true, force: true });
  execSync('python -m build --no-isolation -w', { stdio: 'inherit' });

  const wheels = fs
    .readdirSync(distDir)
    .filter(file => /^foxsnakecode-.*\.whl$/.test(file));
  if (wheels.length !== 1) {
    throw new Error(`Expected one wheel in dist/, found: ${wheels.join(', ')}`);
  }
  fs.renameSync(
    path.join(distDir, wheels[0]),
    path.join(distDir, 'foxsnakecode-0.0.0-py3-none-any.whl')
  );

  fs.rmSync(path.join(demoDir, '.jupyterlite.doit.db'), { force: true });
  fs.rmSync(path.join(demoDir, '_output'), { recursive: true, force: true });
  execSync('jupyter lite build .', { cwd: demoDir, stdio: 'inherit' });
} catch (err) {
  console.error('Build failed:', err);
  process.exit(1);
}
