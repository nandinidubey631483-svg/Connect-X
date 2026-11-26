// jest-dom adds custom jest matchers for asserting on DOM nodes.
import "@testing-library/jest-dom";

// Mock ResizeObserver for JSDOM
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock HTMLCanvasElement.prototype.getContext for JSDOM
HTMLCanvasElement.prototype.getContext = () => ({
  clearRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  bezierCurveTo: () => {},
  stroke: () => {},
  arc: () => {},
  fill: () => {},
  save: () => {},
  restore: () => {},
  translate: () => {},
  rotate: () => {},
  fillText: () => {},
  fillRect: () => {},
  setTransform: () => {},
});
