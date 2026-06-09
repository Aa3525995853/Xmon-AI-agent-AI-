/**
 * @file verify.js
 * @description Lightweight project verification for core backend contracts.
 * @module scripts
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const REQUIRED_FILES = [
  'package.json',
  'packages/backend/package.json',
  'packages/backend/src/server.js',
  'packages/backend/src/routes/digest_routes.js',
  'packages/backend/src/routes/direct_routes.js',
  'packages/backend/src/services/info_digest_service.js',
  'packages/backend/src/services/direct_action_service.js',
  'packages/frontend/index.html'
];

let failed = false;

function report(ok, message) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
  if (!ok) failed = true;
}

function requireFromRoot(relativePath) {
  return require(path.join(ROOT_DIR, relativePath));
}

function verifyFiles() {
  for (const relativePath of REQUIRED_FILES) {
    report(fs.existsSync(path.join(ROOT_DIR, relativePath)), `file exists: ${relativePath}`);
  }
}

function verifyBackendContracts() {
  const InfoDigestService = requireFromRoot('packages/backend/src/services/info_digest_service.js');
  const infoDigestService = InfoDigestService.instance;
  report(typeof InfoDigestService === 'function', 'InfoDigestService exports a constructor');
  report(!!infoDigestService, 'InfoDigestService exposes a singleton instance');
  report(typeof infoDigestService.detectType === 'function', 'InfoDigestService.detectType exists');
  report(infoDigestService.detectType('example.pdf', 'application/pdf') === 'pdf', 'InfoDigestService detects PDF files');

  const DirectActionService = requireFromRoot('packages/backend/src/services/direct_action_service.js');
  report(typeof DirectActionService === 'function', 'DirectActionService exports a constructor');
  report(Array.isArray(DirectActionService.QUICK_TOOLS), 'DirectActionService.QUICK_TOOLS exists');
  report(DirectActionService.QUICK_TOOLS.length > 0, 'DirectActionService.QUICK_TOOLS is not empty');
}

function verifyNoHardcodedClaudeKey() {
  const cliPath = path.join(ROOT_DIR, 'packages/backend/src/scripts/claude_cli.py');
  const content = fs.readFileSync(cliPath, 'utf8');
  report(!/sk-[A-Za-z0-9]{20,}/.test(content), 'claude_cli.py does not contain a hardcoded API key');
}

verifyFiles();
verifyBackendContracts();
verifyNoHardcodedClaudeKey();

process.exit(failed ? 1 : 0);
