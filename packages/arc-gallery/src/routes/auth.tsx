import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/auth/catalog.ts";
import { demos } from "../examples/auth/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/auth")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Auth templates" },
  head: { meta: [{ title: "Auth templates | arc gallery" }] },
});
