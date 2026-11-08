import fs from 'fs';
import os from 'os';
import path from 'path';
import * as tar from 'tar';

const extensionName = 'foxsnakecode';
const inputPath = 'foxsnakecode/labextension';
const outputPath = `demo/_output/extensions/${extensionName}`;
const jsonPath = 'demo/_output/jupyter-lite.json';
const packageDir = 'foxsnakecode';
const kernelPackagesDir = 'demo/_output/xeus/xeus-kernels/kernel_packages';
const sitePackagesPrefix = 'lib/python3.13/site-packages/foxsnakecode';

function updateFederatedExtension(staticDir, jsonFilePath) {
  const remoteEntryFile = fs
    .readdirSync(staticDir)
    .find(file => /^remoteEntry\.[a-f0-9]+\.js$/.test(file));
  if (!remoteEntryFile) {
    throw new Error('No matching remoteEntry.<hash>.js file found.');
  }

  const json = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
  const extensions = json['jupyter-config-data'].federated_extensions;
  if (!Array.isArray(extensions)) {
    throw new Error('Missing "federated_extensions" array.');
  }

  const target = extensions.find(ext => ext.name === extensionName);
  if (!target) {
    throw new Error(`Extension with name "${extensionName}" not found.`);
  }

  target.load = `static/${remoteEntryFile}`;
  fs.writeFileSync(jsonFilePath, JSON.stringify(json, null, 2));
  console.log(`Updated "load" value to: static/${remoteEntryFile}`);
}

function cleanAndCopy(sourceDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  console.log(`Copied from ${sourceDir} to ${targetDir}`);
}

function listAllFiles(dir, baseDir = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory()
      ? listAllFiles(fullPath, baseDir)
      : [path.relative(baseDir, fullPath)];
  });
}

async function updateKernelPackage() {
  const archiveName = fs
    .readdirSync(kernelPackagesDir)
    .find(file => file.startsWith(extensionName));
  if (!archiveName) {
    throw new Error('Please run build:demo first');
  }
  const archivePath = path.join(kernelPackagesDir, archiveName);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${extensionName}-`));

  await tar.x({
    file: archivePath,
    cwd: tempDir,
    filter: file => !file.startsWith('lib/')
  });

  const targetDir = path.join(tempDir, sitePackagesPrefix);
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(packageDir)) {
    if (entry !== 'labextension' && entry !== '__pycache__') {
      fs.cpSync(path.join(packageDir, entry), path.join(targetDir, entry), {
        recursive: true
      });
    }
  }

  fs.rmSync(archivePath);
  await tar.c(
    { gzip: true, file: archivePath, cwd: tempDir, portable: true },
    listAllFiles(tempDir)
  );
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`Updated kernel package: ${archivePath}`);
}

try {
  if (!fs.existsSync(jsonPath)) {
    throw new Error('Please run build:demo first');
  }
  updateFederatedExtension(path.join(inputPath, 'static'), jsonPath);
  cleanAndCopy(inputPath, outputPath);
  await updateKernelPackage();
} catch (err) {
  console.error('Update failed:', err);
  process.exit(1);
}
