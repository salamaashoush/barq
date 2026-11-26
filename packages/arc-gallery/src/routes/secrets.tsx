import { createFileRoute } from "@barqjs/router";

import { catalog } from "../examples/secrets/catalog.ts";
import { demos } from "../examples/secrets/index.ts";
import { GroupPage } from "../gallery/example.tsx";

export const Route = createFileRoute("/secrets")({
  component: () => <GroupPage catalog={catalog} demos={demos} />,
  staticData: { crumb: "Keys and secrets" },
  head: { meta: [{ title: "Keys and secrets | arc gallery" }] },
});
