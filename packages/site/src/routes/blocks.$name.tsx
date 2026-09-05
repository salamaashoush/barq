import { createFileRoute } from "@barqjs/router";

import { BlockPage } from "../pages.tsx";

export const Route = createFileRoute("/blocks/$name")({ component: BlockPage });
