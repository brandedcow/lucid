// PostToolUse hook: run Prettier on a file right after Claude edits or writes it.
// Reads the hook payload from stdin; never blocks the edit (always exits 0).
const { spawnSync } = require('node:child_process');
const path = require('node:path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  try {
    const filePath = JSON.parse(input.replace(/^﻿/, ''))?.tool_input?.file_path;
    if (!filePath) return;

    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const relative = path.relative(root, path.resolve(root, filePath));
    // Skip files outside the project.
    if (relative.startsWith('..') || path.isAbsolute(relative)) return;

    const result = spawnSync(
      'npx',
      ['prettier', '--write', '--ignore-unknown', '--log-level', 'warn', relative],
      { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
    );
    if (result.status !== 0) {
      console.error(`prettier failed on ${relative}:\n${result.stderr || result.stdout}`);
    }
  } catch (error) {
    console.error(`format hook error: ${error.message}`);
  }
});
