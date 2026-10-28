// Local Pages Functions with Wrangler's supported Hyperdrive emulator.
// The emulator verifies the origin certificate/hostname using the existing CA.
// Access JWT verification, reader identity checks and SQL run unchanged in workerd.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { parse } from 'dotenv';

const root = process.cwd();
const values = parse(fs.readFileSync(path.join(root, '.dev.vars')));
const assets = path.resolve(process.argv[2] || 'out');
const ca = values.FINDER_LOCAL_CA_FILE;
if (!ca || !path.isAbsolute(ca) || !fs.readFileSync(ca, 'utf8').includes('BEGIN CERTIFICATE')) {
    throw new Error('Set FINDER_LOCAL_CA_FILE to the existing trusted CA PEM file in private .dev.vars.');
}
if (!fs.existsSync(path.join(assets, 'property-finder/search/index.html'))) {
    throw new Error('Build the current static export first, or supply its directory as an argument.');
}
let local;
try { local = new URL(values.FINDER_DATABASE_URL); }
catch { throw new Error('Set FINDER_DATABASE_URL to the restricted reader URI in private .dev.vars.'); }
local.searchParams.set('sslmode', 'verify-full');
local.searchParams.set('sslrootcert', ca);

const worker = spawn(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'pages', 'dev', assets, '--ip', '127.0.0.1', '--port', '8788', '--log-level', 'error'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
        ...process.env,
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
        // Environment only: never put this credential in wrangler.jsonc or CLI arguments.
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_FINDER_HYPERDRIVE: local.href,
        WRANGLER_WRITE_LOGS: 'false',
        WRANGLER_LOG_SANITIZE: 'true',
        WRANGLER_SEND_METRICS: 'false',
    },
});

// Keep raw Wrangler diagnostics off disk and redact complete lines before output.
// Buffer across chunks so a split credential cannot escape the filter.
const secrets = [...Object.values(values), local.href, decodeURIComponent(local.password)].filter(Boolean);
for (const output of [worker.stdout, worker.stderr]) {
    const decoder = new StringDecoder('utf8');
    let pending = '';
    const print = (line) => {
        for (const secret of secrets) line = line.split(secret).join('[redacted]');
        console.error(line.replace(/postgres(?:ql)?:\/\/\S+/gi, '[database URI redacted]'));
    };
    output.on('data', (chunk) => {
        pending += decoder.write(chunk);
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines) print(line);
    });
    output.on('end', () => { pending += decoder.end(); if (pending) print(pending); });
}
console.log('Local Pages preview: http://127.0.0.1:8788 (real Access authentication required)');
console.log('FINDER_HYPERDRIVE uses local emulation with verify-full and the existing CA; hosted pooling is not exercised.');
process.on('SIGINT', () => worker.kill('SIGTERM'));
process.on('SIGTERM', () => worker.kill('SIGTERM'));
worker.on('error', () => { console.error('Could not start the local Pages runtime.'); process.exitCode = 1; });
worker.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGTERM' ? 0 : 1); });
