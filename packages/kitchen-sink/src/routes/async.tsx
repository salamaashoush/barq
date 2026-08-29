import { createFileRoute } from "@barqjs/router";

import { AsyncDemo } from "../demos/AsyncDemo";

export const Route = createFileRoute("/async")({ component: AsyncDemo });
