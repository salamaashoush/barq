import {
  type Cell,
  type JSXElement,
  createRenderEffect,
  isServer,
  onCleanup,
  readSlot,
} from "@barqjs/core";
import { type QueryClient, onlineManager } from "@tanstack/query-core";
import type {
  DevtoolsButtonPosition,
  DevtoolsErrorType,
  DevtoolsPosition,
  TanstackQueryDevtools,
  Theme,
} from "@tanstack/query-devtools";

import { useQueryClient } from "./client.ts";

export interface BarqQueryDevtoolsProps {
  /** Start with the panel open. */
  initialIsOpen?: boolean;
  buttonPosition?: DevtoolsButtonPosition;
  position?: DevtoolsPosition;
  /** A client other than the one in scope. */
  client?: QueryClient;
  errorTypes?: DevtoolsErrorType[];
  styleNonce?: string;
  shadowDOMTarget?: ShadowRoot;
  hideDisabledQueries?: boolean;
  theme?: Theme;
}

type Slots = { [K in keyof BarqQueryDevtoolsProps]?: Cell<BarqQueryDevtoolsProps[K]> };

/**
 * TanStack's own devtools, mounted beside the application.
 *
 * The panel is imported when this component is built in a browser and never
 * before, so an application that renders it behind a development flag ships
 * none of it otherwise. It mounts into an element of its own on `document.body`
 * and renders nothing in place: a server has no panel to send, so there is
 * nothing here for hydration to disagree about.
 *
 * The panel is a Solid 1 application, and Solid 1 delegates events through the
 * same `$$<type>` expando this runtime does. While it is loaded, its document
 * listener finds the application's delegated handlers too and calls them a
 * second time, which is why this belongs behind a development flag.
 */
export const BarqQueryDevtools = ((props: Slots): unknown => {
  const client = useQueryClient(
    readSlot(props.client, "BarqQueryDevtools.client") as QueryClient | undefined,
  );
  if (isServer) return null;

  const slot = <K extends keyof BarqQueryDevtoolsProps>(name: K): BarqQueryDevtoolsProps[K] =>
    readSlot(props[name], `BarqQueryDevtools.${name}`) as BarqQueryDevtoolsProps[K];
  const live = () => ({
    buttonPosition: slot("buttonPosition"),
    position: slot("position"),
    initialIsOpen: slot("initialIsOpen"),
    errorTypes: slot("errorTypes"),
    theme: slot("theme"),
  });

  let devtools: TanstackQueryDevtools | undefined;
  let latest = live();
  const apply = (target: TanstackQueryDevtools): void => {
    if (latest.buttonPosition !== undefined) target.setButtonPosition(latest.buttonPosition);
    if (latest.position !== undefined) target.setPosition(latest.position);
    target.setInitialIsOpen(latest.initialIsOpen ?? false);
    target.setErrorTypes(latest.errorTypes ?? []);
    target.setTheme(latest.theme ?? "system");
  };
  createRenderEffect(live, (next) => {
    latest = next;
    if (devtools !== undefined) apply(devtools);
  });

  const parent = document.createElement("div");
  parent.className = "tsqd-parent-container";
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    devtools?.unmount();
    parent.remove();
  });

  const mounted = import("@tanstack/query-devtools").then((module) => {
    if (disposed) return;
    devtools = new module.TanstackQueryDevtools({
      client,
      queryFlavor: "Barq Query",
      version: "5",
      onlineManager,
      buttonPosition: latest.buttonPosition,
      position: latest.position,
      initialIsOpen: latest.initialIsOpen,
      errorTypes: latest.errorTypes,
      styleNonce: slot("styleNonce"),
      shadowDOMTarget: slot("shadowDOMTarget"),
      hideDisabledQueries: slot("hideDisabledQueries"),
      theme: latest.theme,
    });
    document.body.append(parent);
    devtools.mount(parent);
  });
  mounted.catch((error: unknown) => {
    console.error(
      "[barq] The query devtools could not be loaded, so the devtools panel is not shown. Check that `@tanstack/query-devtools` is installed. The error:",
      error,
    );
  });

  return null;
}) as unknown as (props: BarqQueryDevtoolsProps) => JSXElement;
