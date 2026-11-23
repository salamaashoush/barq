import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

import { plugin } from "bun";
import { compilerLoader } from "@barqjs/vite/internal";

import { installCanvas } from "./test-canvas.ts";

installCanvas();

plugin(compilerLoader({ transform: { dev: true, hydratable: true } }));
