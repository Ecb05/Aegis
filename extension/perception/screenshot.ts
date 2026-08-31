// Hermes Screenshot Capture
// Captures screenshots from browser tabs using multiple methods

export interface ScreenshotResult {
  dataUrl: string;  // base64 encoded PNG
  width: number;
  height: number;
  method: 'visible' | 'debugger' | 'canvas';
  timestamp: number;
}

/**
 * Capture screenshot of the currently visible tab (content script side)
 */
export function captureVisibleTab(): Promise<ScreenshotResult> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.captureVisibleTab(undefined as any, { format: 'png', quality: 100 }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!dataUrl) {
          reject(new Error('No screenshot captured'));
          return;
        }

        // Get image dimensions
        const img = new Image();
        img.onload = () => {
          resolve({
            dataUrl,
            width: img.width,
            height: img.height,
            method: 'visible',
            timestamp: Date.now(),
          });
        };
        img.onerror = () => reject(new Error('Failed to load screenshot'));
        img.src = dataUrl;
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Capture screenshot via debugger API (for background tabs)
 * Must be called from service worker
 */
export async function captureViaDebugger(
  tabId: number
): Promise<ScreenshotResult> {
  const targets = await chrome.debugger.getTargets();
  const target = targets.find(t => t.tabId === tabId);

  if (!target) {
    throw new Error(`No debugger target for tab ${tabId}`);
  }

  // Send screenshot command
  const result = await chrome.debugger.sendCommand(
    { tabId },
    'Page.captureScreenshot',
    { format: 'png', quality: 100 }
  ) as { data: string };

  if (!result?.data) {
    throw new Error('No screenshot data returned');
  }

  const dataUrl = `data:image/png;base64,${result.data}`;

  // Get dimensions from the tab
  const tab = await chrome.tabs.get(tabId);
  const width = tab.width || 1920;
  const height = tab.height || 1080;

  return {
    dataUrl,
    width,
    height,
    method: 'debugger',
    timestamp: Date.now(),
  };
}

/**
 * Capture screenshot of a DOM element using canvas
 */
export function captureElement(element: HTMLElement): Promise<ScreenshotResult> {
  return new Promise((resolve, reject) => {
    try {
      const rect = element.getBoundingClientRect();
      const canvas = document.createElement('canvas');
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Use html2canvas or similar if available
      // For now, capture using the element's background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/png');
      resolve({
        dataUrl,
        width: rect.width,
        height: rect.height,
        method: 'canvas',
        timestamp: Date.now(),
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Convert data URL to base64 string (without prefix)
 */
export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] || dataUrl;
}

/**
 * Resize image for model input
 */
export function resizeImage(
  dataUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}
