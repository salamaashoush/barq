import { createFileRoute } from "@barqjs/router";

import { ChartsPage } from "../charts/index.tsx";

export const Route = createFileRoute("/charts/$type")({ component: ChartsPage });
