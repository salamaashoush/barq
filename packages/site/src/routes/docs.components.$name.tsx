import { createFileRoute } from "@barqjs/router";

import { ComponentDocPage } from "../docs/page.tsx";

export const Route = createFileRoute("/docs/components/$name")({ component: ComponentDocPage });
