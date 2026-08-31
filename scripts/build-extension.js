// Hermes Extension Build Script
// Bundles content scripts and side panel with esbuild, copies static files

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const EXT_DIR = path.join(ROOT_DIR, 'extension');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDist() {
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  ensureDir(DIST_DIR);
}

/**
 * Bundle TypeScript files with esbuild into single JS files
 * This resolves all imports into one file — no ES modules needed
 */
async function bundleScripts() {
  console.log('Bundling scripts with esbuild...');

  // Content script (injected into pages) — must be a single file, no modules
  await esbuild.build({
    entryPoints: [path.join(EXT_DIR, 'content', 'content.ts')],
    bundle: true,
    outfile: path.join(DIST_DIR, 'content', 'content.js'),
    format: 'iife',       // Immediately invoked — no import/export
    target: 'chrome90',
    sourcemap: false,
    minify: false,
  });
  console.log('  ✓ content/content.js');

  // Side panel script — must be a single file
  await esbuild.build({
    entryPoints: [path.join(EXT_DIR, 'ui', 'sidepanel', 'sidepanel.ts')],
    bundle: true,
    outfile: path.join(DIST_DIR, 'ui', 'sidepanel', 'sidepanel.js'),
    format: 'iife',
    target: 'chrome90',
    sourcemap: false,
    minify: false,
  });
  console.log('  ✓ ui/sidepanel/sidepanel.js');

  // Service worker — can use modules but let's bundle it too for safety
  await esbuild.build({
    entryPoints: [path.join(EXT_DIR, 'background', 'service-worker.ts')],
    bundle: true,
    outfile: path.join(DIST_DIR, 'background', 'service-worker.js'),
    format: 'iife',
    target: 'chrome90',
    sourcemap: false,
    minify: false,
  });
  console.log('  ✓ background/service-worker.js');

  // Offscreen document — for model inference (bundles Transformers.js)
  await esbuild.build({
    entryPoints: [path.join(EXT_DIR, 'offscreen', 'offscreen.ts')],
    bundle: true,
    outfile: path.join(DIST_DIR, 'offscreen', 'offscreen.js'),
    format: 'iife',
    target: 'chrome90',
    sourcemap: false,
    minify: false,
  });

  // Strip CDN URLs from ORT to comply with extension CSP
  const offscreenPath = path.join(DIST_DIR, 'offscreen', 'offscreen.js');
  let offscreenCode = fs.readFileSync(offscreenPath, 'utf8');
  offscreenCode = offscreenCode.replace(
    /const wasmPathPrefix = `https:\/\/cdn\.jsdelivr\.net[^`]*`;/g,
    'const wasmPathPrefix = "";'
  );
  fs.writeFileSync(offscreenPath, offscreenCode);
  console.log('  ✓ offscreen/offscreen.js (CDN stripped)');

  // Copy WASM files from node_modules to offscreen directory
  const ortDist = path.join(ROOT_DIR, 'node_modules', 'onnxruntime-web', 'dist');
  const ortFiles = ['ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.asyncify.mjs'];
  for (const file of ortFiles) {
    const src = path.join(ortDist, file);
    const dest = path.join(DIST_DIR, 'offscreen', file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  ✓ offscreen/${file}`);
    }
  }

  console.log('✓ All scripts bundled');
}

function copyManifest() {
  const src = path.join(EXT_DIR, 'manifest.json');
  const dest = path.join(DIST_DIR, 'manifest.json');
  fs.copyFileSync(src, dest);
  console.log('✓ Copied manifest.json');
}

/**
 * Copy HTML and CSS files (non-TypeScript)
 */
function copyStaticFiles() {
  const htmlCssFiles = [
    { src: 'ui/sidepanel/sidepanel.html', dest: 'ui/sidepanel/sidepanel.html' },
    { src: 'ui/sidepanel/sidepanel.css', dest: 'ui/sidepanel/sidepanel.css' },
    { src: 'offscreen/index.html', dest: 'offscreen/index.html' },
  ];

  for (const { src, dest } of htmlCssFiles) {
    const srcPath = path.join(EXT_DIR, src);
    const destPath = path.join(DIST_DIR, dest);
    ensureDir(path.dirname(destPath));
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  console.log('✓ Copied HTML/CSS files');
}

function createPlaceholderIcons() {
  const iconsDir = path.join(DIST_DIR, 'icons');
  ensureDir(iconsDir);

  for (const size of [16, 48, 128]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#6366f1" rx="${Math.round(size/8)}"/>
  <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="${Math.round(size*0.5)}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">H</text>
</svg>`;
    fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svg);
  }
  console.log('✓ Created placeholder icons');
}

// Main build
async function main() {
  console.log('Building Hermes Extension...\n');

  cleanDist();
  await bundleScripts();
  copyManifest();
  copyStaticFiles();
  createPlaceholderIcons();

  console.log('\n✅ Build complete!');
  console.log('   Load the dist/ folder as an unpacked extension in chrome://extensions');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
