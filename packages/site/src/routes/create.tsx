import { createFileRoute } from "@barqjs/router";

import { Designer } from "../gallery.tsx";

export const Route = createFileRoute("/create")({ component: Designer });
