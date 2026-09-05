import { createFileRoute } from "@barqjs/router";

import { ComponentsDirectory } from "../docs/directory.tsx";

export const Route = createFileRoute("/docs/components/")({ component: ComponentsDirectory });
