import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node >=25 defines an uninitialized global web storage accessor that Vitest's
// populateGlobal skips; bind jsdom's Storage without invoking Node's getter.
const jsdomWindow = (
  globalThis as {
    jsdom?: { window?: { localStorage?: Storage; sessionStorage?: Storage } };
  }
).jsdom?.window;

if (jsdomWindow) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    const storage = jsdomWindow[key];
    if (storage) {
      Object.defineProperty(globalThis, key, {
        value: storage,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    }
  }
}

// Runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});
