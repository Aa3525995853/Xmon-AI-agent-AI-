/**
 * @file lint.js
 * @description Dependency-free project lint checks for quality gate basics.
 * @module scripts
 */

const fs = require('fs');
const path = require('path');

function findRoot(startDir) {
  let current = startDir;
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

const ROOT_DIR = findRoot(process.cwd());
const CHECK_DIRS = [
  'packages/backend/src',
  'packages/frontend/src',
  'packages/shared/src',
  'scripts'
];
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'data',
  'logs',
  'uploads',
  '.git',
  '.venv'
]);
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.ts',
  '.vue',
  '.json',
  '.py',
  '.ps1',
  '.md'
]);

let failed = false;

function fail(message) {
  failed = true;
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  console.warn(`WARN ${message}`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8'));
}

function walk(relativeDir, results = []) {
  const absoluteDir = path.join(ROOT_DIR, relativeDir);
  if (!fs.existsSync(absoluteDir)) return results;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = path.relative(ROOT_DIR, absolutePath);
    if (entry.isDirectory()) {
      walk(relativePath, results);
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(relativePath);
    }
  }

  return results;
}

function checkLintScripts() {
  const packageFiles = [
    'packages/backend/package.json',
    'packages/frontend/package.json',
    'packages/shared/package.json'
  ];

  for (const packageFile of packageFiles) {
    const pkg = readJson(packageFile);
    const lintScript = pkg.scripts?.lint || '';
    if (/TODO|echo/i.test(lintScript)) {
      fail(`${packageFile} has placeholder lint script: ${lintScript}`);
    }
  }

  if (!failed) pass('package lint scripts are not placeholders');
}

function checkHardcodedSecrets() {
  const secretPatterns = [
    /\bsk-[A-Za-z0-9]{20,}\b/,
    /\b(?:api[_-]?key|token|secret)\s*=\s*["'][A-Za-z0-9_\-.]{20,}["']/i,
    /\bprivateKey["']?\s*:\s*["'][A-Za-z0-9_\-]{20,}["']/i
  ];
  const allowedPatterns = [
    /test-[a-z-]*key/i,
    /process\.env/i,
    /scripts[\\/]lint\.js/
  ];

  for (const dir of CHECK_DIRS) {
    for (const file of walk(dir)) {
      const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
      if (allowedPatterns.some(pattern => pattern.test(content))) continue;
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          fail(`${file} appears to contain a hardcoded secret`);
          break;
        }
      }
    }
  }

  if (!failed) pass('no hardcoded secrets found in checked source paths');
}

function checkGeneratedSourceDirs() {
  const generatedDirs = [
    'packages/backend/src/logs',
    'packages/backend/src/uploads',
    'packages/frontend/src/dist'
  ];
  let foundGeneratedDir = false;

  for (const dir of generatedDirs) {
    if (fs.existsSync(path.join(ROOT_DIR, dir))) {
      foundGeneratedDir = true;
      warn(`generated/runtime directory exists inside source tree: ${dir}`);
    }
  }

  if (!foundGeneratedDir) {
    pass('no generated runtime directories inside checked source tree');
  }
}

checkLintScripts();
checkHardcodedSecrets();
checkGeneratedSourceDirs();

process.exit(failed ? 1 : 0);
