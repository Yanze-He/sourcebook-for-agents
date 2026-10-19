// WorkBuddy accepts a single executable token for the MCP command, but
// expands PLUGIN_ROOT in arguments. Resolve the bundled native helper here.
const { spawn } = require('node:child_process');
const path = require('node:path');

const helper = path.join(__dirname, 'bin', process.platform === 'win32' ? 'sourcebook-mcp.exe' : 'sourcebook-mcp');
const child = spawn(helper, process.argv.slice(2), {
  cwd: __dirname,
  env: { ...process.env, SOURCEBOOK_AGENT_NAME: 'WorkBuddy' },
  stdio: 'inherit',
});

child.on('error', (error) => {
  process.stderr.write(`Sourcebook MCP could not start: ${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
