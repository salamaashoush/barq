/**
 * The markup the server wrote, claimed by the client that follows it.
 *
 * SSR is only half the claim: a page whose server markup the client cannot
 * claim is a page that renders twice, throws away every node the server sent
 * and loses the focus, the scroll position and the selection with them. That
 * failure looks identical to a working page in a screenshot and identical to a
 * working page in `ssr.test.ts`, which only ever reads the string.
 *
 * The server half is BUNDLED for the string backend, exactly as in
 * `ssr.test.ts`; the client half is this package compiled for the DOM by the
 * suite's own loader. One source, two backends, which is what a real
 * application does.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { flush } from "@barqjs/core";
import { renderAndHydrate } from "@barqjs/testing";
import { cssRegistration } from "@barqjs/vite/internal";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler") as {
  transform(code: string, options?: Record<string, unknown>): { code: string; css?: string };
};

/**
 * The same source through one backend or the other, both hydratable.
 *
 * `hydratable` is off by default — a page that is never hydrated pays neither
 * the wire bytes nor the work — so BOTH halves have to ask for it: the server
 * writes the range markers and the client walk reads them.
 */
function halfPlugin(ssr: boolean) {
  return {
    name: ssr ? "barq-ssr" : "barq-dom",
    setup(build: {
      onLoad(
        filter: { filter: RegExp },
        load: (args: { path: string }) => { contents: string; loader: "ts" | "tsx" },
      ): void;
    }) {
      build.onLoad({ filter: /\.tsx?$/ }, (args) => {
        const result = native.transform(readFileSync(args.path, "utf8"), {
          filename: args.path,
          ssr,
          hydratable: true,
          strictCss: true,
        });
        const contents =
          result.css === undefined || result.css === ""
            ? result.code
            : result.code + cssRegistration(args.path, result.css);
        return { contents, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" } as const;
      });
    },
  };
}

const root = fileURLToPath(new URL("../index.ts", import.meta.url));
const workspace = mkdtempSync(
  join(fileURLToPath(new URL("../../node_modules/", import.meta.url)), "barq-ui-hydrate-"),
);

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

let probes = 0;

async function half(source: string, ssr: boolean): Promise<() => never> {
  const at = probes++;
  const entry = join(workspace, `probe${String(at)}.tsx`);
  writeFileSync(entry, source.replaceAll("<root>", root));

  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    plugins: [halfPlugin(ssr)],
    external: ["@barqjs/core", "@barqjs/web", "@barqjs/css", "@barqjs/server"],
  });
  if (!result.success)
    throw new AggregateError(result.logs, `the ${ssr ? "server" : "client"} half did not build`);

  const file = join(workspace, `built${String(at)}-${ssr ? "ssr" : "dom"}.mjs`);
  writeFileSync(file, await (result.outputs[0] as { text(): Promise<string> }).text());
  const mod = (await import(file)) as { Page: () => never };
  return mod.Page;
}

/** One fixture, both backends, which is what a real application ships. */
async function halves(source: string): Promise<{ server: () => never; client: () => never }> {
  return { server: await half(source, true), client: await half(source, false) };
}

describe("hydration", () => {
  test("a card the server wrote is CLAIMED, not rebuilt", async () => {
    const { server, client } = await halves(`
      import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "<root>";
      export function Page() {
        return (
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <Badge>New</Badge>
            </CardHeader>
            <CardContent>Twelve, four of them unpaid.</CardContent>
            <Button>Export</Button>
          </Card>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });

    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.claimed).toBeGreaterThan(0);
    // By REFERENCE: every node in the tree is one the server sent.
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector('[data-slot="badge"]')?.textContent).toBe("New");
    result.unmount();
  });

  test("a control the server wrote still works after the walk", async () => {
    // Claiming a node and never binding its handler is the failure that looks
    // like a working page until somebody presses the thing.
    const { server, client } = await halves(`
      import { Checkbox } from "<root>";
      export function Page() {
        return <Checkbox>Accept the terms</Checkbox>;
      }
    `);

    const result = renderAndHydrate({ server, client });
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);

    // The control the server wrote responds: claiming a node and never binding
    // its handler is the failure that looks like a working page until somebody
    // presses the thing.
    const input = result.container.querySelector("input") as HTMLInputElement;
    const label = result.container.querySelector("label") as HTMLElement;
    expect(label.hasAttribute("data-selected")).toBe(false);
    input.click();
    flush();
    expect(label.hasAttribute("data-selected")).toBe(true);
    result.unmount();
  });

  test("a table the server wrote keeps its rows rather than writing them again", async () => {
    const { server, client } = await halves(`
      import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "<root>";
      export function Page() {
        return (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Invoice</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              <TableRow><TableCell>INV-001</TableCell></TableRow>
              <TableRow><TableCell>INV-002</TableCell></TableRow>
            </TableBody>
          </Table>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });

    expect(result.mismatches).toEqual([]);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelectorAll("tbody tr")).toHaveLength(2);
    result.unmount();
  });

  test("a navigation menu is claimed, and its triggers open panels afterwards", async () => {
    // Its root adds a viewport after the children and each trigger has a
    // conditional beside it: a `<Show>` next to a sibling is the shape that
    // lost a node between the two halves once.
    const { server, client } = await halves(`
      import {
        NavigationMenu,
        NavigationMenuContent,
        NavigationMenuItem,
        NavigationMenuLink,
        NavigationMenuList,
        NavigationMenuTrigger,
      } from "<root>";
      export function Page() {
        return (
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Products</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <NavigationMenuLink href="/analytics">Analytics</NavigationMenuLink>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink href="/pricing" active>Pricing</NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });

    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);

    const trigger = result.container.querySelector<HTMLElement>(
      '[data-slot="navigation-menu-trigger"]',
    );
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    trigger?.click();
    flush();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(
      result.container.querySelector('[data-slot="navigation-menu-content"]')?.textContent,
    ).toBe("Analytics");
    result.unmount();
  });

  test("the identifiers agree, or the label names nothing after the walk", async () => {
    // `id()` numbers from the owner's position in the scope tree, so the two
    // halves have to compute the same string from the same shape.
    const { server, client } = await halves(`
      import { Checkbox } from "<root>";
      export function Page() {
        return <Checkbox>Accept</Checkbox>;
      }
    `);
    const result = renderAndHydrate({ server, client });

    const before = /<label[^>]*\\bid="([^"]+)"/.exec(result.html)?.[1];
    const after = result.container.querySelector("label")?.getAttribute("id");
    if (before !== undefined) expect(after).toBe(before);
    expect(result.mismatches).toEqual([]);
    result.unmount();
  });

  test("a written command palette is claimed, and typing filters the list the server sent", async () => {
    // A label and an empty state behind a `<Show>` each, beside siblings, and
    // items that register themselves as the walk reaches them.
    const command = fileURLToPath(new URL("./command.tsx", import.meta.url));
    const { server, client } = await halves(`
      import {
        Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
        CommandSeparator,
      } from "${command}";
      export function Page() {
        return (
          <Command label="Commands">
            <CommandInput placeholder="Type a command" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Settings">
                <CommandItem>Profile</CommandItem>
                <CommandItem>Billing</CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandItem>Sign out</CommandItem>
            </CommandList>
          </Command>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });

    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    flush();

    const input = result.container.querySelector<HTMLInputElement>('[data-slot="command-input"]');
    const shown = (): string[] =>
      [...result.container.querySelectorAll('[data-slot="command-item"]')]
        .filter((node) => !node.hasAttribute("hidden"))
        .map((node) => node.textContent ?? "");
    expect(shown()).toEqual(["Profile", "Billing", "Sign out"]);
    expect(document.getElementById(input?.getAttribute("aria-activedescendant") ?? "")).not.toBe(
      null,
    );

    if (input !== null) {
      input.value = "bill";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    flush();
    expect(shown()).toEqual(["Billing"]);
    result.unmount();
  });

  test("a written select is claimed, and then shows the value its options name", async () => {
    // The options are built off the page on the client only, so the server's
    // trigger has no text for its value and the client's does. That has to be
    // an update to a claimed node rather than a rebuilt trigger.
    const select = fileURLToPath(new URL("./select.tsx", import.meta.url));
    const { server, client } = await halves(`
      import {
        Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
      } from "${select}";
      export function Page() {
        return (
          <form>
            <Select defaultValue="banana" name="fruit">
              <SelectTrigger aria-label="Fruit"><SelectValue placeholder="Pick one" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Fruits</SelectLabel>
                  <SelectItem value="apple">Apple</SelectItem>
                  <SelectItem value="banana">Banana</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </form>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });

    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    flush();
    await Promise.resolve();
    flush();

    const trigger = result.container.querySelector('[data-slot="select-trigger"]');
    expect(trigger?.getAttribute("role")).toBe("combobox");
    expect(trigger?.textContent).toBe("Banana");
    expect(result.container.querySelector('[data-slot="select-item"]')).toBeNull();
    const form = result.container.querySelector("form");
    expect(form === null ? null : new FormData(form).get("fruit")).toBe("banana");
    result.unmount();
  });

  test("a written combobox is claimed, field, chips and all", async () => {
    // A `<Show>` beside a sibling is the shape that broke before: the clear
    // button is one, in the same addon as the toggle, and each chip carries
    // another around its remove button.
    const combobox = fileURLToPath(new URL("./combobox.tsx", import.meta.url));
    const { server, client } = await halves(`
      import { For } from "@barqjs/core";
      import {
        Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent,
        ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxValue,
      } from "${combobox}";
      const NAMES = ["Remix", "Astro"];
      export function Page() {
        return (
          <form>
            <Combobox items={NAMES} defaultValue="Astro" name="framework">
              <ComboboxInput aria-label="Framework" showClear />
              <ComboboxContent>
                <ComboboxEmpty>No items found.</ComboboxEmpty>
                <ComboboxList>{(item) => <ComboboxItem value={item}>{item}</ComboboxItem>}</ComboboxList>
              </ComboboxContent>
            </Combobox>
            <Combobox multiple items={NAMES} defaultValue={["Remix"]}>
              <ComboboxChips>
                <ComboboxValue>
                  {(values) => (
                    <>
                      <For each={values}>{(value) => <ComboboxChip>{value}</ComboboxChip>}</For>
                      <ComboboxChipsInput aria-label="Frameworks" />
                    </>
                  )}
                </ComboboxValue>
              </ComboboxChips>
            </Combobox>
          </form>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });

    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    flush();
    await Promise.resolve();
    flush();

    const field = result.container.querySelector<HTMLInputElement>(
      '[data-slot="input-group-control"]',
    );
    expect(field?.getAttribute("role")).toBe("combobox");
    expect(field?.value).toBe("Astro");
    expect(result.container.querySelector('[data-slot="combobox-clear"]')).not.toBeNull();
    expect(result.container.querySelector('[data-slot="combobox-chip"]')?.textContent).toContain(
      "Remix",
    );
    expect(result.container.querySelector('[data-slot="combobox-item"]')).toBeNull();
    const form = result.container.querySelector("form");
    expect(form === null ? null : new FormData(form).get("framework")).toBe("Astro");
    result.unmount();
  });

  test("a menubar is claimed, and its triggers are one Tab stop that opens menus afterwards", async () => {
    // Each menu has a portalled popover behind a `<Show>` beside its trigger,
    // and the bar decides the roving `tabindex` from which menus registered:
    // both halves have to reach the same answer about a tree neither has shown.
    const { server, client } = await halves(`
      import {
        Menubar,
        MenubarContent,
        MenubarItem,
        MenubarMenu,
        MenubarTrigger,
      } from "<root>";
      export function Page() {
        return (
          <Menubar aria-label="Application">
            <MenubarMenu>
              <MenubarTrigger role="menuitem">File</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>New tab</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger role="menuitem">Edit</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>Undo</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });

    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);

    const triggers = [
      ...result.container.querySelectorAll<HTMLElement>('[data-slot="menubar-trigger"]'),
    ];
    expect(triggers.map((trigger) => trigger.getAttribute("tabindex"))).toEqual(["0", "-1"]);

    // The handlers were bound to the nodes the server sent.
    triggers[0]?.focus();
    triggers[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
    );
    flush();
    expect(document.activeElement === triggers[1]).toBe(true);

    triggers[1]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
    flush();
    await Promise.resolve();
    flush();
    expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");
    const menu = document.querySelector<HTMLElement>('[data-slot="menubar-content"]');
    expect(menu?.textContent).toBe("Undo");

    menu?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    flush();
    await Promise.resolve();
    flush();
    expect(document.querySelector('[data-slot="menubar-content"]')).toBeNull();
    result.unmount();
  });
  test("written tabs are claimed, and a press moves the selection the server chose", async () => {
    const { server, client } = await halves(`
      import { Tabs, TabsContent, TabsList, TabsTrigger } from "<root>";
      export function Page() {
        return (
          <Tabs defaultValue="account">
            <TabsList aria-label="Settings">
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="password">Password</TabsTrigger>
            </TabsList>
            <TabsContent value="account">Account settings</TabsContent>
            <TabsContent value="password">Password settings</TabsContent>
          </Tabs>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);

    const tabs = [...result.container.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    (tabs[1] as HTMLElement).click();
    flush();
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    result.unmount();
  });

  test("a splitter and a toggle group are claimed, and still answer the keyboard and a press", async () => {
    const { server, client } = await halves(`
      import {
        ResizableHandle, ResizablePanel, ResizablePanelGroup, ToggleGroup, ToggleGroupItem,
      } from "<root>";
      export function Page() {
        return (
          <div>
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel defaultSize={40}>Files</ResizablePanel>
              <ResizableHandle aria-label="Resize files" />
              <ResizablePanel defaultSize={60}>Editor</ResizablePanel>
            </ResizablePanelGroup>
            <ToggleGroup type="single" aria-label="Alignment">
              <ToggleGroupItem value="start">Start</ToggleGroupItem>
              <ToggleGroupItem value="end">End</ToggleGroupItem>
            </ToggleGroup>
          </div>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);

    const handle = result.container.querySelector('[role="separator"]') as HTMLElement;
    expect(handle.getAttribute("aria-valuenow")).toBe("40");
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    flush();
    expect(handle.getAttribute("aria-valuenow")).toBe("41");

    const items = [
      ...result.container.querySelectorAll<HTMLElement>('[data-slot="toggle-group-item"]'),
    ];
    (items[1] as HTMLElement).click();
    flush();
    expect(items.map((item) => item.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    result.unmount();
  });

  test("a written select with no name, inside a form, is claimed", async () => {
    const { server, client } = await halves(`
      import {
        Field, FieldGroup, FieldLabel, Input,
        Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
      } from "<root>";
      export function Page() {
        return (
          <form>
            <FieldGroup>
              <Field>
                <FieldLabel for="form-name">Name</FieldLabel>
                <Input id="form-name" type="text" placeholder="salama" required />
              </Field>
              <div>
                <Field>
                  <FieldLabel for="form-country">Country</FieldLabel>
                  <Select defaultValue="us">
                    <SelectTrigger id="form-country"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us">United States</SelectItem>
                      <SelectItem value="uk">United Kingdom</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel for="form-month">Month</FieldLabel>
                  <Select defaultValue="">
                    <SelectTrigger id="form-month"><SelectValue placeholder="MM" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="01">01</SelectItem>
                        <SelectItem value="02">02</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </FieldGroup>
          </form>
        );
      }
    `);

    const result = renderAndHydrate({ server, client });

    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    flush();
    await Promise.resolve();
    flush();

    const triggers = [...result.container.querySelectorAll('[data-slot="select-trigger"]')];
    expect(triggers.map((trigger) => trigger.getAttribute("role"))).toEqual([
      "combobox",
      "combobox",
    ]);
    expect(triggers[0]?.id).toBe("form-country");
    expect(triggers[0]?.textContent).toBe("United States");
    expect(triggers[1]?.textContent).toBe("MM");
    // The control a form validates and autofills, which only a client can know
    // to add: it arrives once the claim is over.
    const hidden = [...result.container.querySelectorAll("select")];
    expect(hidden).toHaveLength(2);
    expect(hidden[0]?.value).toBe("us");
    result.unmount();
  });
});
