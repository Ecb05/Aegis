// Hermes Debugger Bridge
// Multi-tab operation via Chrome Debugger API (DevTools Protocol)

let attachedTabs: Set<number> = new Set();

/**
 * Attach debugger to a tab
 */
export async function attachDebugger(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) return;

  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      attachedTabs.add(tabId);

      // Enable Page domain for screenshots
      chrome.debugger.sendCommand({ tabId }, 'Page.enable', {}, () => {
        resolve();
      });
    });
  });
}

/**
 * Detach debugger from a tab
 */
export async function detachDebugger(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) return;

  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      attachedTabs.delete(tabId);
      resolve();
    });
  });
}

/**
 * Capture screenshot of any tab (including background)
 */
export async function captureTabScreenshot(tabId: number): Promise<string> {
  await attachDebugger(tabId);

  const result = await new Promise<any>((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId },
      'Page.captureScreenshot',
      { format: 'png', quality: 100 },
      (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      }
    );
  });

  if (!result?.data) {
    throw new Error('No screenshot data');
  }

  return `data:image/png;base64,${result.data}`;
}

/**
 * Execute JavaScript in any tab
 */
export async function evaluateInTab(tabId: number, expression: string): Promise<any> {
  await attachDebugger(tabId);

  const result = await new Promise<any>((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
      },
      (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      }
    );
  });

  if (result?.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Evaluation error');
  }

  return result?.result?.value;
}

/**
 * Dispatch mouse event in any tab
 */
export async function dispatchMouseEvent(
  tabId: number,
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved',
  x: number,
  y: number,
  button: 'left' | 'right' | 'middle' = 'left',
  clickCount: number = 1
): Promise<void> {
  await attachDebugger(tabId);

  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId },
      'Input.dispatchMouseEvent',
      {
        type,
        x,
        y,
        button,
        clickCount,
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      }
    );
  });
}

/**
 * Click at coordinates in any tab
 */
export async function clickAt(tabId: number, x: number, y: number): Promise<void> {
  await dispatchMouseEvent(tabId, 'mousePressed', x, y, 'left', 1);
  await dispatchMouseEvent(tabId, 'mouseReleased', x, y, 'left', 1);
}

/**
 * Dispatch keyboard event in any tab
 */
export async function dispatchKeyEvent(
  tabId: number,
  type: 'keyDown' | 'keyUp' | 'char',
  key: string,
  modifiers?: number
): Promise<void> {
  await attachDebugger(tabId);

  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId },
      'Input.dispatchKeyEvent',
      {
        type,
        key,
        modifiers,
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      }
    );
  });
}

/**
 * Type text in any tab
 */
export async function typeInTab(tabId: number, text: string): Promise<void> {
  for (const char of text) {
    await dispatchKeyEvent(tabId, 'char', char);
  }
}

/**
 * Get DOM of any tab
 */
export async function getTabDOM(tabId: number): Promise<string> {
  await attachDebugger(tabId);

  const result = await new Promise<any>((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression: 'document.documentElement.outerHTML',
        returnByValue: true,
      },
      (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      }
    );
  });

  return result?.result?.value || '';
}

/**
 * Scroll in any tab
 */
export async function scrollTo(
  tabId: number,
  x: number,
  y: number
): Promise<void> {
  await attachDebugger(tabId);

  await evaluateInTab(tabId, `window.scrollTo(${x}, ${y})`);
}

/**
 * Get viewport dimensions of any tab
 */
export async function getViewportSize(tabId: number): Promise<{ width: number; height: number }> {
  const result = await evaluateInTab(tabId, `
    JSON.stringify({ width: window.innerWidth, height: window.innerHeight })
  `);
  return JSON.parse(result);
}

/**
 * Cleanup: detach all debuggers
 */
export async function detachAll(): Promise<void> {
  const promises = Array.from(attachedTabs).map(tabId => detachDebugger(tabId));
  await Promise.all(promises);
}
