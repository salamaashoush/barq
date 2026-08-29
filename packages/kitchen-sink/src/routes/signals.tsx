import { createFileRoute } from "@barqjs/router";

import { SignalsDemo } from "../demos/SignalsDemo";

export const Route = createFileRoute("/signals")({ component: SignalsDemo });
