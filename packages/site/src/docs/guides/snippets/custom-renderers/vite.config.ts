import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    barq({
      compiler: {
        renderers: [
          {
            include: "src/scene/**",
            target: "universal",
            moduleSource: "/src/scene/renderer.ts",
          },
        ],
      },
    }),
  ],
});
