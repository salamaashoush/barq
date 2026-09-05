import { createFileRoute } from "@barqjs/router";

import { BlocksIndex } from "../pages.tsx";

export const Route = createFileRoute("/blocks/")({ component: BlocksIndex });
