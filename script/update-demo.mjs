import fs from 'fs';
import path from 'path';

const extensionName = 'foxsnakecode';
const inputPath = 'foxsnakecode/labextension';
const outputPath = `demo/_output/extensions/${extensionName}`;
const jsonPath = 'demo/_output/jupyter-lite.json';

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

try {
  if (!fs.existsSync(jsonPath)) {
    throw new Error('Please run build:demo first');
  }
  updateFederatedExtension(path.join(inputPath, 'static'), jsonPath);
  cleanAndCopy(inputPath, outputPath);
  cleanAndCopy('demo/files', 'demo/_output/files');
} catch (err) {
  console.error('Update failed:', err);
  process.exit(1);
}
