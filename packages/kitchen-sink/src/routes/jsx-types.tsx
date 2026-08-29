import { createFileRoute } from "@barqjs/router";

import { JsxTypesDemo } from "../demos/JsxTypesDemo";

export const Route = createFileRoute("/jsx-types")({ component: JsxTypesDemo });
