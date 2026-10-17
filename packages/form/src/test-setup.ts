import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

import { plugin } from "bun";
import { compilerLoader } from "@barqjs/vite/internal";

plugin(compilerLoader({ transform: { dev: true } }));
