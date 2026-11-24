import { type Child, Show, createEffect } from "@barqjs/core";
import {
  AppShell,
  ArcProvider,
  type CommandMenuGroup,
  CommandMenu,
  Inline,
  Text,
} from "@barqjs/arc";
import { layout, space } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { on } from "@barqjs/ui/conditions";
import { Zap } from "@barqjs/lucide/icons/zap";
import { HeadContent, Outlet, Scripts, createRootRoute, retainSearchParams } from "@barqjs/router";
import { getRequestEvent } from "@barqjs/web";

import "@barqjs/ui/theme/reset";
import { Controls } from "../gallery/controls.tsx";
import { ViewportFrame } from "../gallery/frame.tsx";
import { GROUPS, NAVIGATION, pathOf } from "../gallery/groups.ts";
import { localeOf, readSettings, useSettings } from "../gallery/settings.ts";

const gallery = layer("gallery");

const page = gallery(layout.container, {
  padding: { default: space.x4, [on.md]: space.x8 },
  maxWidth: "80rem",
  marginInline: "auto",
  width: "100%",
});

/** What the address asks for, on the server from the request and in the page from `location`. */
function addressed(): URLSearchParams {
  const url =
    getRequestEvent()?.request.url ?? (typeof location === "undefined" ? undefined : location.href);
  return new URL(url ?? "http://localhost/").searchParams;
}

function Shell(props: { children: Child }) {
  const settings = readSettings(addressed());
  return (
    <html lang={localeOf(settings.dir)} dir={settings.dir}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
      </head>
      <body>
        <div id="app">{props.children}</div>
        <Scripts />
      </body>
    </html>
  );
}

const COMMANDS: readonly CommandMenuGroup[] = [
  {
    heading: "Pages",
    actions: [
      { label: "Overview", to: "/" },
      ...GROUPS.map((group) => ({
        label: group.catalog.title,
        to: pathOf(group.catalog),
        icon: group.icon,
      })),
    ],
  },
  {
    heading: "Components",
    actions: GROUPS.flatMap((group) =>
      group.catalog.examples.map((example) => ({
        label: example.title,
        to: pathOf(group.catalog),
        hash: example.id,
        icon: group.icon,
        keywords: [...example.covers, group.catalog.title],
      })),
    ),
  },
];

function Brand() {
  return (
    <Inline gap={2} align="center">
      <Zap />
      <Text weight="strong">arc gallery</Text>
    </Inline>
  );
}

function Gallery() {
  const api = useSettings();
  const settings = () => api.settings();

  // The shell sets these on the first paint; a control changes them after.
  createEffect(
    () => [settings().dir, localeOf(settings().dir)] as const,
    ([dir, lang]) => {
      document.documentElement.dir = dir;
      document.documentElement.lang = lang;
    },
  );

  return (
    <ArcProvider
      theme={settings().preset.theme}
      density={settings().density}
      contrast={settings().contrast ? "high" : undefined}
      locale={localeOf(settings().dir)}
    >
      <Show
        when={!settings().embedded}
        fallback={
          <main class={page}>
            <Outlet />
          </main>
        }
      >
        <AppShell
          navigation={NAVIGATION}
          header={<Brand />}
          actions={<Controls api={api} />}
          side={settings().dir === "rtl" ? "right" : "left"}
        >
          <Show
            when={settings().viewport === "desktop"}
            fallback={
              <ViewportFrame viewport={settings().viewport === "phone" ? "phone" : "tablet"} />
            }
          >
            <div class={page}>
              <Outlet />
            </div>
          </Show>
        </AppShell>
        <CommandMenu groups={COMMANDS} placeholder="Search components..." />
      </Show>
    </ArcProvider>
  );
}

export const Route = createRootRoute({
  shellComponent: Shell,
  head: {
    meta: [
      { title: "arc gallery" },
      { name: "description", content: "Every @barqjs/arc component, working." },
    ],
  },
  component: Gallery,
  search: {
    middlewares: [retainSearchParams(["theme", "density", "dir", "contrast", "viewport", "embed"])],
  },
});
