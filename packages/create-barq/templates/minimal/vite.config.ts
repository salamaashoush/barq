import barq from "@barqjs/compiler/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [barq()],
});
