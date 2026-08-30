import { barqRouter } from "@barqjs/router/vite";
import { barqStart } from "@barqjs/start/vite";
import { defineConfig } from "vite";

let routes: readonly string[] = [];

export default defineConfig({
  plugins: [
    barqRouter({ onRoutes: (patterns) => (routes = patterns) }),
    barqStart({
      // No page rendering: `index.html` is the document and the router mounts
      // into it in the browser. What this plugin still does is compile the app
      // and mount the server functions, which is the half an SPA needs.
      pages: false,
      // A thunk, not an array — `onRoutes` fires after this object is built.
      compiler: { routes: () => routes },
    }),
  ],
});
