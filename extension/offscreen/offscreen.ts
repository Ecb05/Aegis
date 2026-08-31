// Hermes Offscreen Document
// Runs model inference locally using Transformers.js + ONNX Runtime Web
// Uses publicly accessible models from Xenova namespace

import * as ort from "onnxruntime-web/webgpu";
import { pipeline, env } from "@huggingface/transformers";

// Configure ORT for Chrome Extension environment
// Disable WASM disk cache (chrome-extension:// scheme not supported by CacheStorage)
ort.env.wasm.numThreads = 1;
ort.env.wasm.initTimeout = 0;
(ort.env.wasm as any).wasmBinaryCache = false;

// Force absolute path resolution for WASM/MJS assets
const wasmDir = chrome.runtime.getURL("offscreen/");
(ort.env.wasm as any).wasmPaths = wasmDir;
console.log("[Hermes Offscreen] WASM paths set to:", wasmDir);

// Force remote model fetching from HuggingFace Hub
Object.assign(env, {
  allowLocalModels: false,
  useBrowserCache: true,
  useWasmCache: false,
  allowRemoteModels: true,
  remoteHost: "https://huggingface.co/",
});

if ((env as any).backends?.onnx?.wasm) {
  (env as any).backends.onnx.wasm.wasmPaths = wasmDir;
  (env as any).backends.onnx.wasm.wasmBinaryCache = false;
}

// Force WebGPU execution without DOM canvas dependencies
try {
  (env as any).backends = (env as any).backends || {};
  (env as any).backends.webgpu = (env as any).backends.webgpu || {};
  (env as any).backends.webgpu.executionProvider = "webgpu";
} catch (e) {
  console.warn(
    "[Hermes Offscreen] Failed setting webgpu execution provider override",
    e,
  );
}
// Model instances (lazy loaded)
let classificationModel: any = null;
let detectionModel: any = null;
let embeddingModel: any = null;

// Status tracking
let modelsReady = false;
let loadingProgress: Record<string, string> = {};

/**
 * Initialize all models using WebGPU only
 */
async function initModels(): Promise<void> {
  console.log("[Hermes Offscreen] Initializing models (WebGPU only)...");

  // Check WebGPU support
  if (!(navigator as any).gpu) {
    const msg =
      "WebGPU not supported. Requires Chrome 113+ with WebGPU enabled.";
    console.error("[Hermes Offscreen]", msg);
    throw new Error(msg);
  }

  try {
    // Image classification — Xenova/vit-base-patch16-224 (public, ~340MB)
    loadingProgress.classification = "loading";
    classificationModel = await pipeline(
      "image-classification",
      "Xenova/vit-base-patch16-224",
      {
        device: "webgpu",
      },
    );
    loadingProgress.classification = "ready";
    console.log("[Hermes Offscreen] Classification model ready");

    // Object detection — Xenova/detr-resnet-50 (public, ~170MB)
    loadingProgress.detection = "loading";
    detectionModel = await pipeline(
      "object-detection",
      "Xenova/detr-resnet-50",
      {
        device: "webgpu",
      },
    );
    loadingProgress.detection = "ready";
    console.log("[Hermes Offscreen] Detection model ready");

    // Text embeddings — Xenova/bge-small-en-v1.5 (public, ~67MB)
    loadingProgress.embedding = "loading";
    embeddingModel = await pipeline(
      "feature-extraction",
      "Xenova/bge-small-en-v1.5",
      {
        device: "webgpu",
      },
    );
    loadingProgress.embedding = "ready";
    console.log("[Hermes Offscreen] Embedding model ready");

    modelsReady = true;
    console.log("[Hermes Offscreen] All models ready");
  } catch (err) {
    console.error("[Hermes Offscreen] Model init failed:", err);
    throw err;
  }
}

/**
 * Classify a page screenshot
 */
async function classifyPage(imageData: string): Promise<any> {
  if (!classificationModel) {
    throw new Error("Classification model not loaded");
  }

  const blob = base64ToBlob(imageData);
  const url = URL.createObjectURL(blob);

  try {
    const result = await classificationModel(url);
    URL.revokeObjectURL(url);
    return {
      type: "classification",
      predictions: result.map((r: any) => ({
        label: r.label,
        score: r.score,
      })),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Detect UI elements in a screenshot
 */
async function detectElements(imageData: string): Promise<any> {
  if (!detectionModel) {
    throw new Error("Detection model not loaded");
  }

  const blob = base64ToBlob(imageData);
  const url = URL.createObjectURL(blob);

  try {
    const result = await detectionModel(url, {
      threshold: 0.5,
      percentage: true,
    });
    URL.revokeObjectURL(url);

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

/**
 * Generate embeddings for text
 */
async function embedText(text: string): Promise<any> {
  if (!embeddingModel) {
    throw new Error("Embedding model not loaded");
  }

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
 * Full perception pipeline: classify + detect
 */
async function perceive(imageData: string): Promise<any> {
  const [classification, detection] = await Promise.all([
    classifyPage(imageData).catch((err) => ({ error: err.message })),
    detectElements(imageData).catch((err) => ({ error: err.message })),
  ]);

  return {
    type: "perception",
    classification,
    detection,
    timestamp: Date.now(),
  };
}

// Utility: base64 to Blob
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

// Listen for messages from service worker
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
        .then((result) => {
          sendResponse(result);
        })
        .catch((err) => {
          sendResponse({ error: err.message });
        });
      return true;
    }

    if (message.type === "OFFSCREEN_DETECT") {
      detectElements(message.imageData)
        .then((result) => {
          sendResponse(result);
        })
        .catch((err) => {
          sendResponse({ error: err.message });
        });
      return true;
    }

    if (message.type === "OFFSCREEN_EMBED") {
      embedText(message.text)
        .then((result) => {
          sendResponse(result);
        })
        .catch((err) => {
          sendResponse({ error: err.message });
        });
      return true;
    }

    if (message.type === "OFFSCREEN_PERCEIVE") {
      perceive(message.imageData)
        .then((result) => {
          sendResponse(result);
        })
        .catch((err) => {
          sendResponse({ error: err.message });
        });
      return true;
    }

    return false;
  },
);

console.log("[Hermes Offscreen] Document loaded, waiting for init...");
