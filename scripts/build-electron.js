const path = require('path');
const esbuild = require('esbuild');

async function buildElectron() {
  console.log('⚡ Building Electron Main & Preload for production...');
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
    sourcemap: false,
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });
  console.log('✅ Production Electron build completed.');
}

buildElectron().catch((err) => {
  console.error(err);
  process.exit(1);
});
