import { createFileRoute } from "@barqjs/router";

import { CssDemo } from "../demos/CssDemo";

export const Route = createFileRoute("/css")({ component: CssDemo });
