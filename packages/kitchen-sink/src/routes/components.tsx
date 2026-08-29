import { createFileRoute } from "@barqjs/router";

import { ComponentsDemo } from "../demos/ComponentsDemo";

export const Route = createFileRoute("/components")({ component: ComponentsDemo });
