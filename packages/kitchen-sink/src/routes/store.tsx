import { createFileRoute } from "@barqjs/router";

import { StoreDemo } from "../demos/StoreDemo";

export const Route = createFileRoute("/store")({ component: StoreDemo });
