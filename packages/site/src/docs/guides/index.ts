import type { Child } from "@barqjs/core";

import type { DocsSection } from "../../docs.tsx";
import * as changelog from "./changelog.tsx";
import * as cli from "./cli.tsx";
import * as componentsJson from "./components-json.tsx";
import * as customRenderers from "./custom-renderers.tsx";
import * as darkMode from "./dark-mode.tsx";
import * as forms from "./forms.tsx";
import * as installation from "./installation.tsx";
import { GUIDES, type Guide } from "./registry-data.ts";
import * as registry from "./registry.tsx";
import * as rtl from "./rtl.tsx";
import * as serverRendering from "./server-rendering.tsx";
import * as theming from "./theming.tsx";

interface GuideModule {
  readonly sections: readonly DocsSection[];
  readonly Body: () => Child;
}

const MODULES: Record<string, GuideModule> = {
  installation,
  "components-json": componentsJson,
  theming,
  "dark-mode": darkMode,
  rtl,
  cli,
  forms,
  "server-rendering": serverRendering,
  "custom-renderers": customRenderers,
  registry,
  changelog,
};

export const PAGES: readonly Guide[] = GUIDES.flatMap((meta) => {
  const module = MODULES[meta.slug];
  return module === undefined ? [] : [{ ...meta, sections: module.sections, body: module.Body }];
});

export function guideNamed(slug: string): Guide | undefined {
  return PAGES.find((guide) => guide.slug === slug);
}
