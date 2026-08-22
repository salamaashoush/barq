export default {
  server: { port: 4611, strictPort: true },
  plugins: [
    {
      name: "body-injector",
      transformIndexHtml() {
        return [
          { tag: "script", attrs: { type: "module" }, children: 'window.__PREAMBLE__ = performance.now();', injectTo: "body" },
          { tag: "script", children: 'window.__PREAMBLE_CLASSIC__ = 1;', injectTo: "body" },
        ];
      },
    },
  ],
};
