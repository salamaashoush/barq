import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // No `ssr`: `index.html` is the document and the router renders into it in
  // the browser. `start` keeps the server functions and the API routes.
  plugins: [barq({ start: true })],
});
