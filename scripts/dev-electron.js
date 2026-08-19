const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const esbuild = require('esbuild');

const isDev = process.env.NODE_ENV !== 'production';

async function waitForVite(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 500) {
            resolve();
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      console.log('✅ Vite server is ready on ' + url);
      return;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error('Vite dev server failed to start within timeout');
}

async function buildElectron() {
  console.log('⚡ Compiling Electron Main & Preload...');
  await esbuild.build({
    entryPoints: [
      path.resolve(__dirname, '../src/main/index.ts'),
      path.resolve(__dirname, '../src/preload/index.ts')
    ],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outdir: path.resolve(__dirname, '../dist-electron'),
    external: ['electron'],
    sourcemap: 'inline',
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    }
  });
  console.log('✅ Electron build completed');
}

let electronProcess = null;

function startElectron() {
  const electronPath = require('electron');
  const appPath = path.resolve(__dirname, '..');

  electronProcess = spawn(electronPath, [appPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://localhost:5174',
      NODE_ENV: 'development'
    }
  });

  electronProcess.on('close', (code) => {
    process.exit(code || 0);
  });
}

async function main() {
  try {
    await waitForVite('http://localhost:5174');
    await buildElectron();
    startElectron();
  } catch (err) {
    console.error('Error starting electron:', err);
    process.exit(1);
  }
}

main();
