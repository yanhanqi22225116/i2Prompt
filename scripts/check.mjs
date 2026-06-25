import { spawnSync } from 'node:child_process';

const files = [
  'src/shared/i2prompt-shared.js',
  'src/extension/background.js',
  'src/extension/content.js',
  'src/extension/options/options.js',
  'src/extension/popup/popup.js',
  'src/userscript/i2prompt-userscript.js',
  'scripts/build.mjs',
  'scripts/check.mjs',
  'dist/i2prompt.user.js'
];

run('node', ['scripts/build.mjs', '--check']);
for (const file of files) {
  run('node', ['--check', file]);
}
console.log('check ok');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
