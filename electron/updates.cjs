'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const DEFAULT_REPOSITORY = require('../package.json').releaseRepository;

function repository(value) {
  const repo = String(value || '').trim();
  if (repo && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(repo)) throw Error('Enter a GitHub repository as owner/name.');
  return repo;
}
function version(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
  if (!match) throw Error('Updates require a stable version such as v0.1.1.');
  return match.slice(1).map(Number);
}
function newer(candidate, current) {
  const a = version(candidate), b = version(current);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
function selectRelease(release, current, repo) {
  if (release.draft || release.prerelease || !newer(release.tag_name, current)) return null;
  const tag = release.tag_name;
  const number = tag.replace(/^v/, '');
  const name = `H3X-Searcher-Setup-${number}-x64.exe`;
  const asset = release.assets?.find(a => a.name === name);
  const sums = release.assets?.find(a => a.name === 'SHA256SUMS.txt');
  if (!asset || !sums) throw Error('Release is missing its x64 installer or SHA256SUMS.txt.');
  for (const file of [asset, sums]) {
    const url = new URL(file.browser_download_url);
    const expected = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${file.name}`;
    if (url.href !== expected) throw Error('Unexpected update download URL.');
  }
  return { version: number, asset, sums };
}
function checksum(text, name) {
  const entry = text.split(/\r?\n/).map(line => /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line)).find(m => m && m[2] === name);
  if (!entry) throw Error('Installer checksum is missing.');
  return entry[1].toLowerCase();
}

function setupUpdates({ app, ipcMain, net }) {
  const configFile = path.join(app.getPath('userData'), 'updates.json');
  let config = { repository: DEFAULT_REPOSITORY, enabled: true };
  let status = { phase: 'idle', message: 'Updates use ' + DEFAULT_REPOSITORY + '.', version: app.getVersion(), progress: 0 };
  let busy = false, ready = null;
  const set = (phase, message, extra = {}) => { status = { ...status, phase, message, ...extra }; };
  const snapshot = () => ({ ...status, ...config, supported: app.isPackaged && process.platform === 'win32' && process.arch === 'x64' });
  async function response(url, limit, onChunk) {
    const result = await net.fetch(url, { headers: { 'User-Agent': 'H3X-Searcher', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(600000) });
    if (!result.ok) throw Error(`GitHub request failed (${result.status}). Try again later.`);
    let size = 0; const chunks = [];
    for await (const chunk of result.body) {
      size += chunk.length;
      if (size > limit) throw Error('Update download exceeds the size limit.');
      if (onChunk) await onChunk(chunk, size); else chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  async function check(manual = false) {
    if (busy || ready) return snapshot();
    if (!snapshot().supported) { if (manual) set('idle', 'Updates are available in the installed Windows x64 app.'); return snapshot(); }
    if (!config.repository || (!manual && !config.enabled)) return snapshot();
    busy = true; let folder;
    try {
      set('checking', 'Checking GitHub for updates...', { progress: 0 });
      const release = JSON.parse(await response(`https://api.github.com/repos/${config.repository}/releases/latest`, 2 * 1024 * 1024));
      const update = selectRelease(release, app.getVersion(), config.repository);
      if (!update) { set('idle', 'You have the latest version.'); return snapshot(); }
      set('downloading', `Downloading H3X ${update.version}...`, { availableVersion: update.version });
      const expected = checksum(await response(update.sums.browser_download_url, 1024 * 1024), update.asset.name);
      const root = path.join(app.getPath('temp'), 'h3x-updates');
      await fs.mkdir(root, { recursive: true });
      folder = await fs.mkdtemp(path.join(root, 'update-'));
      const file = path.join(folder, update.asset.name);
      const handle = await fs.open(file, 'wx'); const hash = crypto.createHash('sha256');
      try {
        await response(update.asset.browser_download_url, 500 * 1024 * 1024, async (chunk, size) => {
          await handle.writeFile(chunk); hash.update(chunk);
          status.progress = Math.min(99, Math.round(size / Math.max(1, update.asset.size) * 100));
        });
      } finally { await handle.close(); }
      if (hash.digest('hex') !== expected) throw Error('Update verification failed. The installer was not run.');
      ready = { file, expected };
      set('ready', `H3X ${update.version} is ready. Install when you are ready to close H3X.`, { progress: 100 });
    } catch (e) {
      if (folder) await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
      set('error', e.message);
    } finally { busy = false; }
    return snapshot();
  }
  ipcMain.handle('updates:status', snapshot);
  ipcMain.handle('updates:configure', async (_, value) => {
    if (busy || ready) throw Error('Finish the current update before changing its source.');
    config = { repository: repository(value.repository), enabled: Boolean(value.enabled) };
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(configFile, JSON.stringify(config), 'utf8');
    set('idle', config.repository ? 'Update source saved.' : 'Updates are not configured.');
    return snapshot();
  });
  ipcMain.handle('updates:check', () => check(true));
  ipcMain.handle('updates:install', async () => {
    if (!ready || busy) throw Error('No verified update is ready.');
    busy = true;
    try {
      const actual = crypto.createHash('sha256').update(await fs.readFile(ready.file)).digest('hex');
      if (actual !== ready.expected) throw Error('Update file changed. Restart H3X and download it again.');
      // The renderer saves the workspace before invoking installation. /S avoids a second wizard.
      const child = spawn(ready.file, ['/S'], { detached: true, stdio: 'ignore', windowsHide: true });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref(); app.quit(); return true;
    } catch (e) { busy = false; set('error', e.message); throw e; }
  });
  (async () => {
    try { const saved = JSON.parse(await fs.readFile(configFile, 'utf8')); config = { repository: repository(saved.repository) || DEFAULT_REPOSITORY, enabled: saved.enabled !== false }; } catch {}
    if (config.repository) set('idle', 'Automatic updates configured.');
    const first = setTimeout(() => check(), 30000); first.unref();
    const timer = setInterval(() => check(), 6 * 60 * 60 * 1000); timer.unref();
    app.once('will-quit', () => { clearTimeout(first); clearInterval(timer); });
  })();
}
module.exports = { setupUpdates, repository, newer, selectRelease, checksum };
