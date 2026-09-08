'use strict';
// Accept preview flags without changing the production Node server architecture.
const { spawn } = require('node:child_process');
const path = require('node:path');
const args = process.argv.slice(2), at = args.indexOf('--port');
const port = at >= 0 ? args[at + 1] : process.env.PORT || '3000';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid development port');
const child = spawn(process.execPath, ['--watch', path.join(__dirname, '../server.js')], { env: { ...process.env, PORT: port }, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code || 0));
