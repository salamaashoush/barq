import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [barq({ ssr: true, start: { verify: true } })],
  server: { port: 5190 },
});
