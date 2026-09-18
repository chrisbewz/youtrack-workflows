const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.idea',
  '.git',
  '.codex',
  '.claude'
]);

const shouldInclude = (sourceRoot, candidate) => {
  const relative = path.relative(sourceRoot, candidate);
  if (!relative) return true;
  return !relative.split(path.sep).some(segment => EXCLUDED_DIRECTORIES.has(segment));
};

const listFiles = root => {
  const files = [];
  const visit = directory => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(path.relative(root, fullPath));
    });
  };
  visit(root);
  return files;
};

const copyWorkflowPackage = (source, destination) => {
  fs.cpSync(source, destination, {
    recursive: true,
    filter: candidate => shouldInclude(source, candidate)
  });
  return listFiles(destination);
};

const requireEnvironmentValue = (name, aliases = []) => {
  const value = [name, ...aliases].map(key => process.env[key]).find(Boolean);
  if (!value) throw new Error('Variável obrigatória ausente: ' + name);
  return value;
};

const uploadWorkflow = (workflowName, environmentName) => {
  if (!/^[a-z0-9-]+$/i.test(workflowName)) throw new Error('Nome de workflow inválido.');
  if (!/^(prod|test)$/.test(environmentName)) throw new Error('Ambiente deve ser prod ou test.');

  const repositoryRoot = path.resolve(__dirname, '..');
  const source = path.join(repositoryRoot, workflowName);
  if (!fs.existsSync(path.join(source, 'manifest.json'))) {
    throw new Error('Manifesto não encontrado em ' + source);
  }

  const host = requireEnvironmentValue('npm_config_host_' + environmentName);
  const token = requireEnvironmentValue('npm_config_token_' + environmentName, [
    environmentName === 'test' ? 'GH_YOUTRACK_WORKFLOWS_ACCESS_TOKEN' : ''
  ].filter(Boolean));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'youtrack-workflow-upload-'));
  const stagedWorkflow = path.join(tempRoot, workflowName);

  try {
    const copiedFiles = copyWorkflowPackage(source, stagedWorkflow);
    if (copiedFiles.length > 1000) {
      throw new Error('Pacote contém ' + copiedFiles.length + ' arquivos; limite do YouTrack é 1000.');
    }
    console.log('Uploading ' + workflowName + ' with ' + copiedFiles.length + ' files (' +
      Array.from(EXCLUDED_DIRECTORIES).join(', ') + ' excluded)');

    const binary = path.join(
      repositoryRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'youtrack-workflow.cmd' : 'youtrack-workflow'
    );
    const result = spawnSync(binary, [
      'upload',
      stagedWorkflow,
      '--host=' + host,
      '--token=' + token
    ], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Upload falhou com código ' + result.status + '.');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
};

if (require.main === module) {
  try {
    uploadWorkflow(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { copyWorkflowPackage, shouldInclude, uploadWorkflow };
