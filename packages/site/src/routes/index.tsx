import { createFileRoute } from "@barqjs/router";

import { Home } from "../home.tsx";

export const Route = createFileRoute("/")({ component: Home });
