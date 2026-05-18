const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const URL_SERVEO = /https:\/\/[a-zA-Z0-9-]+\.serveousercontent\.com/i;
const ANSI_RE = /\x1B\[[0-9;]*m/g;

function resolveCloudflaredPath() {
  if (process.env.CLOUDFLARED_PATH) return process.env.CLOUDFLARED_PATH;
  const local = path.join(__dirname, 'tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(local)) return local;
  return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

// Returns true if URL responds with something other than 503/502.
function pingUrl(url) {
  return new Promise(resolve => {
    const req = https.get(url, { timeout: 8000 }, res => {
      resolve(res.statusCode !== 503 && res.statusCode !== 502);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function spawnTunnel(bin, args, urlRe) {
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let resolved = false;
  const promise = new Promise((resolve, reject) => {
    const onChunk = (buf) => {
      const text = buf.toString();
      text.split('\n').forEach(line => {
        const t = line.replace(ANSI_RE, '').trim();
        if (t) console.log(`[tunnel] ${t}`);
      });
      if (!resolved) {
        const m = text.replace(ANSI_RE, '').match(urlRe);
        if (m) { resolved = true; resolve(m[0]); }
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('error', err => { if (!resolved) reject(err); });
    child.on('exit', code => {
      if (!resolved) reject(new Error(`exited with code ${code} before producing URL`));
    });
    setTimeout(() => {
      if (!resolved) { child.kill(); reject(new Error('no URL within 30s')); }
    }, 30000);
  });

  const stop = () => { try { child.kill(); } catch (_) { /* ignore */ } };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('exit', stop);

  return promise;
}

async function tryCloudflared(port) {
  const bin = resolveCloudflaredPath();
  console.log(`[tunnel] trying cloudflared...`);
  return spawnTunnel(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], URL_RE);
}

async function tryServeo(port) {
  console.log('[tunnel] trying serveo.net...');
  const url = await spawnTunnel(
    'ssh',
    ['-o', 'StrictHostKeyChecking=no', '-o', 'ServerAliveInterval=30',
     '-R', `80:localhost:${port}`, 'serveo.net'],
    URL_SERVEO
  );
  console.log(`[tunnel] serveo URL: ${url}`);
  // Give serveo a moment to fully establish routing
  await new Promise(r => setTimeout(r, 2000));
  const ok = await pingUrl(url);
  if (!ok) throw new Error('serveo URL returned 502/503');
  return url;
}

async function tryLocaltunnel(port) {
  console.log('[tunnel] trying localtunnel...');
  const localtunnel = require('localtunnel');
  const tunnel = await localtunnel({ port });
  console.log(`[tunnel] localtunnel URL: ${tunnel.url}`);

  const stop = () => { try { tunnel.close(); } catch (_) { /* ignore */ } };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('exit', stop);

  const ok = await pingUrl(tunnel.url);
  if (!ok) { tunnel.close(); throw new Error('localtunnel URL returned 502/503'); }
  return tunnel.url;
}

function startTunnel(port) {
  const urlPromise = tryCloudflared(port)
    .catch(err => {
      console.warn(`[tunnel] cloudflared failed: ${err.message}`);
      return tryServeo(port);
    })
    .catch(err => {
      console.warn(`[tunnel] serveo failed: ${err.message}`);
      return tryLocaltunnel(port);
    })
    .catch(err => {
      throw new Error(`All tunnel providers failed. Last error: ${err.message}`);
    });

  return { urlPromise };
}

module.exports = { startTunnel };
