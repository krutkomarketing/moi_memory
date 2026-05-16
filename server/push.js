const { execSync } = require('child_process');
const dir = __dirname.replace(/\\server$/, '');

function run(cmd) {
  console.log('>', cmd);
  const out = execSync(cmd, { cwd: dir, encoding: 'utf8' });
  if (out.trim()) console.log(out.trim());
  return out;
}

try {
  run('git config user.name "Kiro"');
  run('git config user.email "kiro@local"');
  run('git add -A');
  run('git commit -m "feat: create page from site, editor improvements, bug fixes"');
  run('git push origin full_test1');
  run('git push moi full_test1');
  console.log('\n✅ Pushed to both remotes');
} catch (e) {
  console.error('Error:', e.message);
  if (e.stdout) console.log(e.stdout);
  if (e.stderr) console.error(e.stderr);
}
