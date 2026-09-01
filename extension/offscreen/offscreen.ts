// Hermes Offscreen Document v3
// Runs model inference locally using Transformers.js (which bundles its own ORT)
// + Tesseract.js OCR
//
// KEY: All ORT config goes through env.backends.onnx.wasm.* — NOT through
// a standalone onnxruntime-web import. Transformers.js encapsulates its own
// ONNX Runtime instance; configuring a separate import has no effect.

import { pipeline, env } from "@huggingface/transformers";
import { createWorker, type Worker } from "tesseract.js";

// ─── UNIFIED TRANSFORMERS.JS & ORT CONFIGURATION ─────────────

// 1. Force WASM/MJS assets to resolve from our bundled extension folder
//    Transformers.js reads env.backends.onnx.wasm.wasmPaths — NOT ort.env.wasm
const extensionWasmDir = chrome.runtime.getURL("offscreen/");
env.backends.onnx.wasm.wasmPaths = extensionWasmDir;
console.log("[Hermes Offscreen] Unified WASM paths bound to:", extensionWasmDir);

// 2. Manifest V3 offscreen documents run single-threaded
env.backends.onnx.wasm.numThreads = 1;

// 3. Configure remote model fetching
Object.assign(env, {
  allowLocalModels: false,
  allowRemoteModels: true,
  remoteHost: "https://huggingface.co/",
  useBrowserCache: true,
  useWasmCache: false, // false to avoid chrome.storage sandbox quota rejections
});

// ─── Model Instances ────────────────────────────────────────

let classificationModel: any = null;
let detectionModel: any = null;
let embeddingModel: any = null;
let ocrWorker: Worker | null = null;
let currentDevice: string = "wasm";
let modelsReady = false;
let loadingProgress: Record<string, string> = {};

// ─── Model Initialization ───────────────────────────────────

async function initModels(): Promise<void> {
  console.log("[Hermes Offscreen] Initializing models...");

  try {
    await loadVisionModels();
  } catch (err) {
    console.error("[Hermes Offscreen] Vision model loading failed:", err);
    throw err;
  }

  // OCR — Tesseract.js (all files bundled locally, no CDN/blob URLs)
  loadingProgress.ocr = "loading";
  console.log("[Hermes Offscreen] Loading OCR worker...");
  const offscreenDir = chrome.runtime.getURL("offscreen/");
  ocrWorker = await createWorker("eng", 1, {
    workerPath: offscreenDir + "tesseract-worker.min.js",
    corePath: offscreenDir,  // Points to local tesseract-core-simd-lstm.* files
    workerBlobURL: false,     // CSP-safe: use direct file path, not blob URL
    logger: (m) => {
      if (m.status === "recognizing text") {
        loadingProgress.ocr = `recognizing ${Math.round((m.progress || 0) * 100)}%`;
      }
    },
  });
  loadingProgress.ocr = "ready";
  console.log("[Hermes Offscreen] OCR worker ready");

  modelsReady = true;
  currentDevice = "wasm";
  console.log("[Hermes Offscreen] All models ready");
}

async function loadVisionModels(): Promise<void> {
  // Image classification — ViT base (~340MB)
  loadingProgress.classification = "loading";
  console.log("[Hermes Offscreen] Loading classification model...");
  classificationModel = await pipeline(
    "image-classification",
    "Xenova/vit-base-patch16-224",
    { device: "wasm" },
  );
  loadingProgress.classification = "ready";
  console.log("[Hermes Offscreen] Classification model ready");

  // Object detection — DETR ResNet-50 (~170MB)
  loadingProgress.detection = "loading";
  console.log("[Hermes Offscreen] Loading detection model...");
  detectionModel = await pipeline(
    "object-detection",
    "Xenova/detr-resnet-50",
    { device: "wasm" },
  );
  loadingProgress.detection = "ready";
  console.log("[Hermes Offscreen] Detection model ready");

  // Text embeddings — BGE small (~67MB)
  loadingProgress.embedding = "loading";
  console.log("[Hermes Offscreen] Loading embedding model...");
  embeddingModel = await pipeline(
    "feature-extraction",
    "Xenova/bge-small-en-v1.5",
    { device: "wasm" },
  );
  loadingProgress.embedding = "ready";
  console.log("[Hermes Offscreen] Embedding model ready");
}

// ─── Perception Functions ───────────────────────────────────

async function classifyPage(imageData: string): Promise<any> {
  if (!classificationModel) throw new Error("Classification model not loaded");

  const blob = base64ToBlob(imageData);
  const url = URL.createObjectURL(blob);

  try {
    const result = await classificationModel(url);
    URL.revokeObjectURL(url);
    console.log("[Hermes Offscreen] Classification:", result[0]?.label, result[0]?.score);
    return {
      type: "classification",
      predictions: result.map((r: any) => ({ label: r.label, score: r.score })),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

async function detectElements(imageData: string): Promise<any> {
  if (!detectionModel) throw new Error("Detection model not loaded");

  const blob = base64ToBlob(imageData);
  const url = URL.createObjectURL(blob);

  try {
    const result = await detectionModel(url, {
      threshold: 0.5,
      percentage: true,
    });
    URL.revokeObjectURL(url);
    console.log("[Hermes Offscreen] Detected", result.length, "elements");
    return {
      type: "detection",
      elements: result.map((r: any) => ({
        label: r.label,
        score: r.score,
        bbox: r.box,
      })),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

async function ocrImage(imageData: string): Promise<any> {
  if (!ocrWorker) throw new Error("OCR worker not loaded");

  console.log("[Hermes Offscreen] Running OCR...");
  const blob = base64ToBlob(imageData);
  const url = URL.createObjectURL(blob);

  try {
    const { data } = await ocrWorker.recognize(url);
    URL.revokeObjectURL(url);

    const textBlocks = data.lines.map((line: any) => ({
      text: line.text.trim(),
      confidence: line.confidence / 100,
      bbox: {
        x: line.bbox.x0,
        y: line.bbox.y0,
        width: line.bbox.x1 - line.bbox.x0,
        height: line.bbox.y1 - line.bbox.y0,
      },
    }));

    console.log("[Hermes Offscreen] OCR found", textBlocks.length, "text blocks");
    return {
      type: "ocr",
      fullText: data.text,
      textBlocks,
      confidence: data.confidence / 100,
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

async function embedText(text: string): Promise<any> {
  if (!embeddingModel) throw new Error("Embedding model not loaded");

  const result = await embeddingModel(text, {
    pooling: "mean",
    normalize: true,
  });
  return {
    type: "embedding",
    vector: Array.from(result.data.slice(0, 128)),
  };
}

/**
 * Full perception pipeline: classify + detect + OCR
 */
async function perceive(imageData: string): Promise<any> {
  const start = Date.now();
  console.log("[Hermes Offscreen] Running full perception pipeline...");

  const [classification, detection, ocr] = await Promise.all([
    classifyPage(imageData).catch((err) => ({ error: err.message })),
    detectElements(imageData).catch((err) => ({ error: err.message })),
    ocrImage(imageData).catch((err) => ({ error: err.message })),
  ]);

  const elapsed = Date.now() - start;
  console.log(`[Hermes Offscreen] Perception complete in ${elapsed}ms`);

  return {
    type: "perception",
    classification,
    detection,
    ocr,
    device: currentDevice,
    elapsed,
    timestamp: Date.now(),
  };
}

// ─── Utility ────────────────────────────────────────────────

function base64ToBlob(base64: string): Blob {
  const byteString = atob(base64.split(",")[1] || base64);
  const mimeType = base64.startsWith("data:")
    ? base64.split(":")[1].split(";")[0]
    : "image/png";
  const buffer = new ArrayBuffer(byteString.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < byteString.length; i++) {
    view[i] = byteString.charCodeAt(i);
  }
  return new Blob([buffer], { type: mimeType });
}

// ─── Message Handler ────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: any,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    console.log("[Hermes Offscreen] Received:", message.type);

    if (message.type === "OFFSCREEN_PING") {
      sendResponse({
        type: "OFFSCREEN_PONG",
        ready: modelsReady,
        progress: loadingProgress,
        device: currentDevice,
      });
      return false;
    }

    if (message.type === "OFFSCREEN_INIT") {
      initModels()
        .then(() => {
          sendResponse({
            type: "OFFSCREEN_STATUS",
            ready: modelsReady,
            progress: loadingProgress,
            device: currentDevice,
          });
        })
        .catch((err) => {
          sendResponse({
            type: "OFFSCREEN_STATUS",
            ready: false,
            error: err.message,
          });
        });
      return true;
    }

    if (message.type === "OFFSCREEN_CLASSIFY") {
      classifyPage(message.imageData)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    if (message.type === "OFFSCREEN_DETECT") {
      detectElements(message.imageData)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    if (message.type === "OFFSCREEN_OCR") {
      ocrImage(message.imageData)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    if (message.type === "OFFSCREEN_EMBED") {
      embedText(message.text)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    if (message.type === "OFFSCREEN_PERCEIVE") {
      perceive(message.imageData)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    return false;
  },
);

console.log("[Hermes Offscreen] Document loaded, waiting for init...");
