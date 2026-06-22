const { execSync } = require('node:child_process');

let data = '';
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }
  const file = payload?.tool_input?.file_path;
  if (typeof file !== 'string' || !file.endsWith('.ts')) return;
  try {
    execSync(`pnpm exec eslint --fix "${file}"`, { stdio: 'inherit' });
  } catch {
    // eslint --fix exits non-zero on unfixable errors; don't block the tool call on lint findings.
  }
});
