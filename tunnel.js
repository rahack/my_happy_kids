const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function resolveCloudflaredPath() {
  if (process.env.CLOUDFLARED_PATH) return process.env.CLOUDFLARED_PATH;
  const local = path.join(__dirname, 'tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(local)) return local;
  return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

function startTunnel(port) {
  const bin = resolveCloudflaredPath();
  console.log(`[tunnel] launching: ${bin} tunnel --url http://localhost:${port}`);

  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let resolved = false;
  const urlPromise = new Promise((resolve, reject) => {
    const onChunk = (buf) => {
      const text = buf.toString();
      // Mirror cloudflared output to our logs (trimmed)
      text.split('\n').forEach(line => {
        const t = line.trim();
        if (t) console.log(`[tunnel] ${t}`);
      });
      if (!resolved) {
        const m = text.match(URL_RE);
        if (m) {
          resolved = true;
          resolve(m[0]);
        }
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('error', err => { if (!resolved) reject(err); });
    child.on('exit', code => {
      if (!resolved) reject(new Error(`cloudflared exited with code ${code} before producing URL`));
    });
    setTimeout(() => {
      if (!resolved) reject(new Error('cloudflared did not produce a URL within 30s'));
    }, 30000);
  });

  const stop = () => { try { child.kill(); } catch (_) { /* ignore */ } };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('exit', stop);

  return { urlPromise, child };
}

module.exports = { startTunnel };
