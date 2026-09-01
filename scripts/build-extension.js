// Hermes Extension Build Script v3
// External script files with import_meta.url fix for ORT same-origin checks

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const crypto = require('crypto');

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
 * Post-process offscreen bundle:
 * 1. Strip CDN URLs
 * 2. Fix import_meta.url so ORT same-origin check passes (no blob:)
 */
function patchOffscreenCode(code) {
  // Strip CDN URLs from ORT
  code = code.replace(
    /const wasmPathPrefix = `https:\/\/cdn\.jsdelivr\.net[^`]*`;/g,
    'const wasmPathPrefix = "";'
  );

  // Fix import_meta — esbuild sets it to {} in IIFE format.
  // ORT uses import_meta.url for same-origin checks. When undefined,
  // ORT falls through to blob: URL creation. We set it to the actual
  // script URL so the origin check passes.
  //
  // ORT bundles TWO copies (WebGPU + WASM), using import_meta and import_meta2.
  // Both need the same fix.
  //
  // self.location.href = chrome-extension://EXT_ID/offscreen/index.html
  // new URL("offscreen.js", self.location.href) = chrome-extension://EXT_ID/offscreen/offscreen.js
  // This matches the document origin, so ORT skips blob URL creation.
  const scriptUrlFix = '{ url: new URL("offscreen.js", self.location.href).href }';
  // ORT bundles multiple copies (WebGPU, WASM, etc.) — fix ALL of them
  code = code.replace(
    /(var import_meta\d*)\s*=\s*\{\};/g,
    `$1 = ${scriptUrlFix};`
  );

  return code;
}

/**
 * Generate sha256 hash for CSP
 */
function sha256(content) {
  return 'sha256-' + crypto.createHash('sha256').update(content).digest('base64');
}

async function bundleScripts() {
  console.log('Bundling scripts with esbuild...\n');

  // Content script
  await esbuild.build({
    entryPoints: [path.join(EXT_DIR, 'content', 'content.ts')],
    bundle: true,
    outfile: path.join(DIST_DIR, 'content', 'content.js'),
    format: 'iife',
    target: 'chrome90',
    sourcemap: false,
    minify: false,
  });
  console.log('  ✓ content/content.js');

  // Side panel script
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

  // Service worker
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

  // ─── Offscreen document ─────────────────────────────────
  ensureDir(path.join(DIST_DIR, 'offscreen'));

  await esbuild.build({
    entryPoints: [path.join(EXT_DIR, 'offscreen', 'offscreen.ts')],
    bundle: true,
    outfile: path.join(DIST_DIR, 'offscreen', 'offscreen.js'),
    format: 'iife',
    target: 'chrome90',
    sourcemap: false,
    minify: false,
  });

  // Post-process: fix import_meta.url + strip CDN
  const offscreenPath = path.join(DIST_DIR, 'offscreen', 'offscreen.js');
  let code = fs.readFileSync(offscreenPath, 'utf8');
  code = patchOffscreenCode(code);
  fs.writeFileSync(offscreenPath, code);
  console.log('  ✓ offscreen/offscreen.js (import_meta.url fixed, CDN stripped)');

  // Copy ORT WASM files
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

  // Copy Tesseract.js worker file
  const tesseractWorker = path.join(ROOT_DIR, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
  const tesseractDest = path.join(DIST_DIR, 'offscreen', 'tesseract-worker.min.js');
  if (fs.existsSync(tesseractWorker)) {
    fs.copyFileSync(tesseractWorker, tesseractDest);
    console.log('  ✓ offscreen/tesseract-worker.min.js');
  }

  console.log('\n✓ All scripts bundled');
}

function copyManifest() {
  const src = path.join(EXT_DIR, 'manifest.json');
  const dest = path.join(DIST_DIR, 'manifest.json');
  fs.copyFileSync(src, dest);
  console.log('✓ Copied manifest.json');
}

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
