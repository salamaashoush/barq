import { createFileRoute } from "@barqjs/router";

import { Colors } from "../colors.tsx";

export const Route = createFileRoute("/colors")({ prerender: true, component: Colors });
