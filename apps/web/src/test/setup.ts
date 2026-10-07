import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class ResizeObserverStub {
  observe(): void {
    return;
  }

  unobserve(): void {
    return;
  }

  disconnect(): void {
    return;
  }
}

if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = ResizeObserverStub;
}

afterEach(() => {
  cleanup();
});
