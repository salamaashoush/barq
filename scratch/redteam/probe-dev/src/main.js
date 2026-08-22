import { touched } from "./dep.js";
window.__RESULT__ = {
  t: Math.round(performance.now() - window.__T0__),
  readyState: document.readyState,
  appFound: document.getElementById("app") !== null,
  bootRan: window.__BOOT__ === 1,
  hasViteHot: typeof import.meta.hot,
  viteClientPresent: typeof window.__vite__injectQuery !== "undefined" || !!document.querySelector('script[src*="@vite/client"]'),
  dep: touched,
};
if (import.meta.hot) { import.meta.hot.accept(); window.__RESULT__.hotAccepted = true; }
