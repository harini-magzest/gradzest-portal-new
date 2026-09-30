// On Windows dev machines: clamd can't be installed as a real Windows
// service from this environment (Windows Service Control Manager install
// requires admin/elevated rights — confirmed: "Unable to Open SCManager (5)").
// So on app boot here, we check whether clamd is reachable and spawn it
// detached if not. This does NOT survive a full reboot on its own — running
//   & "C:\Program Files\ClamAV\clamd.exe" --install-service --config-file="C:\ClamAV-db\clamd.conf"
// from an elevated PowerShell fixes that permanently, but needs a human with
// admin rights to run it.
//
// On a real Linux deployment (e.g. an EC2 instance), clamd should instead be
// installed as a proper systemd service (`clamav-daemon`) with root, which
// gives you real OS-level supervision — auto-start on boot, auto-restart on
// crash. Spawning a bare, unsupervised process there would be a step
// backwards from that, not a fallback, so this code doesn't do that on
// non-Windows platforms — it just checks reachability and fails loudly with
// the exact command to fix it.

const net = require('net');
const { spawn } = require('child_process');

const isWindows = process.platform === 'win32';
const CLAMD_HOST = process.env.CLAMD_HOST || '127.0.0.1';
const CLAMD_PORT = Number(process.env.CLAMD_PORT) || 3310;
const CLAMD_BIN = process.env.CLAMD_BIN || 'C:\\Program Files\\ClamAV\\clamd.exe';
const CLAMD_CONFIG = process.env.CLAMD_CONFIG || 'C:\\ClamAV-db\\clamd.conf';

function isClamdReachable(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: CLAMD_HOST, port: CLAMD_PORT });
    const done = (result) => { socket.destroy(); resolve(result); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function ensureClamd() {
  if (await isClamdReachable()) {
    console.log('[ensureClamd] clamd already running on', `${CLAMD_HOST}:${CLAMD_PORT}`);
    return;
  }

  if (!isWindows) {
    console.error(
      '[ensureClamd] clamd is not reachable on', `${CLAMD_HOST}:${CLAMD_PORT}`,
      '— uploads will fail closed (503) until it is running. On this platform it should be a supervised' +
      ' systemd service, not auto-spawned. Fix: sudo systemctl start clamav-daemon' +
      ' (and `sudo systemctl enable clamav-daemon` so it survives reboots).',
    );
    return;
  }

  console.log('[ensureClamd] clamd not reachable — starting it (this loads the signature database, takes 15-50s)...');
  const child = spawn(CLAMD_BIN, ['--config-file', CLAMD_CONFIG], { detached: true, stdio: 'ignore' });
  child.unref();
  child.on('error', (err) => console.error('[ensureClamd] Failed to spawn clamd:', err.message));
}

module.exports = { ensureClamd, isClamdReachable };
