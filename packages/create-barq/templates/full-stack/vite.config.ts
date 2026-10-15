import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    barq({
      ssr: true,
      start: {
        // `/` is the seed. Everything else is found by crawling the links each
        // rendered page produced, and kept only where the route declares
        // `prerender`.
        prerender: { routes: ["/"] },
        // Fails the build when a route reaches a server function that does not
        // carry that route's declared middleware.
        verify: true,
      },
    }),
  ],
});
