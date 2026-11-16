import assert from 'node:assert/strict';
import { createPhotoLazyLoader } from '../public/photo-lazy-loader.js';

class FakeImage extends EventTarget {
  dataset = {};
  isConnected = true;
  parentElement = { setAttribute: (name, value) => { this.parentAttributes[name] = value; } };
  parentAttributes = {};
}

let observerCallback;
let observedImage;
class FakeObserver {
  constructor(callback, options) { observerCallback = callback; this.options = options; }
  observe(image) { observedImage = image; }
  unobserve() {}
  disconnect() {}
}

const image = new FakeImage();
const loader = createPhotoLazyLoader({
  IntersectionObserverImpl: FakeObserver,
  loadThumbnail: async key => ({ key }),
  createObjectURL: blob => `blob:${blob.key}`,
  revokeObjectURL: () => {}
});
loader.observe(image, { url: '/original.jpg', thumbnailKey: 'thumb-1' });
assert.equal(image.loading, 'lazy');
assert.equal(image.decoding, 'async');
assert.equal(image.src, undefined);
assert.equal(image.dataset.lazyState, 'pending');

observerCallback([{ target: observedImage, isIntersecting: true }]);
await Promise.resolve();
assert.equal(image.src, 'blob:thumb-1');
assert.equal(image.dataset.lazyState, 'loading');
image.dispatchEvent(new Event('load'));
assert.equal(image.dataset.lazyState, 'loaded');
assert.equal(image.parentAttributes['aria-busy'], 'false');

const fallbackImage = new FakeImage();
const fallbackLoader = createPhotoLazyLoader({
  IntersectionObserverImpl: null,
  loadThumbnail: async () => { throw new Error('IndexedDB unavailable'); }
});
fallbackLoader.observe(fallbackImage, { url: '/fallback.jpg', thumbnailKey: 'missing' });
await Promise.resolve();
await Promise.resolve();
assert.equal(fallbackImage.src, '/fallback.jpg');

loader.clear();
fallbackLoader.clear();
console.log('Photo lazy loader regression passed');
