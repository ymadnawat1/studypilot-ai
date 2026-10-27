// Global test setup. Only touches browser globals when they exist (jsdom tests).
if (typeof window !== 'undefined') {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom does not provide.
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    });
  }
  // jsdom ships a noisy "not implemented" stub, so replace it unconditionally.
  window.scrollTo = () => {};
}
