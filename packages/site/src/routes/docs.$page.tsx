import { createFileRoute } from "@barqjs/router";

import { GuidePage } from "../docs/guides/page.tsx";

export const Route = createFileRoute("/docs/$page")({ component: GuidePage });
