import { createFileRoute } from "@barqjs/router";

import { ComponentsPage } from "../gallery.tsx";

export const Route = createFileRoute("/docs/components")({
  prerender: true,
  component: ComponentsPage,
});
