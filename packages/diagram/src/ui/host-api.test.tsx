/**
 * `<DiagramEditor>`'s props and children under Excalidraw's names: the
 * lifecycle callbacks, `ui` and `interaction`, the forced tool, the host's
 * components (`Sidebar`, `DefaultSidebar`, `Footer`, `Button`, `Ellipsify`,
 * `Stats`, `CommandPalette`) and the hooks, inside the editor and outside it
 * under `ExcalidrawAPIProvider`.
 */

import { describe, expect, test } from "bun:test";
import { Show, createSignal } from "@barqjs/core";
import { render, screen, user, within } from "@barqjs/testing";
import { FONT_FAMILY } from "@excalidraw/common";

import {
  Button,
  CommandPalette,
  DefaultSidebar,
  DiagramEditor,
  Ellipsify,
  ExcalidrawAPIProvider,
  Footer,
  MainMenu,
  Sidebar,
  Stats,
  useEditorInterface,
  useExcalidrawAPI,
  useExcalidrawStateValue,
  useI18n,
  useOnExcalidrawStateChange,
  useStylesPanelMode,
  type DiagramEditorApi,
} from "../index.ts";
import { createPasteEvent } from "../clipboard.ts";
import { mountEditor, select, settle, setupUITests } from "./test-ui.tsx";

setupUITests();

function key(target: Element, init: KeyboardEventInit) {
  return target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

interface MountedHost {
  excalidrawAPI: DiagramEditorApi;
  container: HTMLElement;
}

describe("the lifecycle", () => {
  test("onMount, onExcalidrawAPI, onInitialize, onIncrement, then onUnmount and a null API", async () => {
    const heard: string[] = [];
    let mounted: MountedHost | null = null;
    const [shown, setShown] = createSignal(true);
    render(() => (
      <Show when={shown()}>
        <DiagramEditor
          height={800}
          onMount={(payload) => {
            mounted = payload;
            heard.push("mount");
          }}
          onExcalidrawAPI={(api) => heard.push(api ? "api" : "api:null")}
          onInitialize={(api) => heard.push(`initialize:${api.isDestroyed}`)}
          onIncrement={(increment) => heard.push(`increment:${increment.type}`)}
          onUnmount={() => heard.push("unmount")}
        />
      </Show>
    ));
    await settle();
    expect(heard.slice(0, 3)).toEqual(["mount", "api", "initialize:false"]);
    expect(mounted!.container.getAttribute("role")).toBe("application");
    mounted!.excalidrawAPI.updateScene({ appState: { viewBackgroundColor: "#eeeeee" } });
    expect(heard).toContain("increment:ephemeral");
    setShown(false);
    await settle();
    expect(heard.slice(-2)).toEqual(["unmount", "api:null"]);
  });

  test("autoFocus focuses the editor once it is mounted", async () => {
    const { region } = await mountEditor({ autoFocus: true });
    expect(document.activeElement).toBe(region);
  });
});

describe("ui", () => {
  test("ui false keeps the host's children and render props, without the default UI", async () => {
    await mountEditor(
      { ui: false, renderTopRightUI: () => <span data-testid="own-top-right">Mine</span> },
      () => (
        <MainMenu>
          <MainMenu.Item onSelect={() => undefined}>Own entry</MainMenu.Item>
        </MainMenu>
      ),
    );
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByTestId("zoom-actions")).toBeNull();
    expect(screen.queryByTestId("sidebar-trigger")).toBeNull();
    expect(screen.getByTestId("own-top-right")).toBeDefined();
    await user.click(screen.getByTestId("main-menu-trigger"));
    await settle();
    expect(screen.getByRole("menuitem", { name: "Own entry" })).toBeDefined();
  });

  test("ui enabled keeps just the zoom; disabled takes the minimap away", async () => {
    await mountEditor({ ui: { enabled: { zoom: true } } });
    expect(screen.getByTestId("zoom-actions")).toBeDefined();
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByTestId("button-undo")).toBeNull();
  });

  test("ui disabled minimap leaves the rest and no minimap toggle", async () => {
    await mountEditor({ ui: { disabled: { minimap: true } } });
    expect(screen.getByRole("toolbar")).toBeDefined();
    expect(screen.queryByTestId("button-minimap")).toBeNull();
  });
});

describe("input", () => {
  test("interaction false makes a read-only editor that takes no keys", async () => {
    const { api, region } = await mountEditor({ interaction: false });
    expect(api.getAppState().viewModeEnabled).toBe(true);
    key(region, { key: "r", code: "KeyR" });
    await settle();
    expect(api.getAppState().activeTool.type).toBe("selection");
  });

  test("activeTool forces the tool, and a new one replaces it", async () => {
    const [tool, setTool] = createSignal<"rectangle" | "ellipse">("rectangle");
    let api: DiagramEditorApi | undefined;
    render(() => (
      <DiagramEditor height={800} activeTool={{ type: tool() }} api={(given) => (api = given)} />
    ));
    await settle();
    expect(api!.getAppState().activeTool.type).toBe("rectangle");
    const region = screen.getByRole("application");
    key(region, { key: "o", code: "KeyO" });
    await settle();
    expect(api!.getAppState().activeTool.type).toBe("rectangle");
    setTool("ellipse");
    await settle();
    expect(api!.getAppState().activeTool.type).toBe("ellipse");
  });

  test("handleKeyboardGlobally and objectsSnapModeEnabled reach the editor", async () => {
    const { api } = await mountEditor({
      handleKeyboardGlobally: true,
      objectsSnapModeEnabled: true,
    });
    expect(api.getAppState().objectsSnapModeEnabled).toBe(true);
    key(document.body, { key: "r", code: "KeyR" });
    await settle();
    expect(api.getAppState().activeTool.type).toBe("rectangle");
  });

  test("imageOptions holds an inserted image to its size", async () => {
    const { api, region } = await mountEditor({ imageOptions: { maxFileSizeBytes: 8 } });
    region.focus();
    const file = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/>'],
      "shape.svg",
      { type: "image/svg+xml" },
    );
    document.dispatchEvent(createPasteEvent({ files: [file] }));
    for (let round = 0; round < 8; round++) await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    expect(String(api.getAppState().errorMessage)).toContain("The file is too big");
    expect(api.getFiles()).toEqual({});
  });

  test("showDeprecatedFonts offers the fonts Excalidraw retired", async () => {
    const text = { type: "text", id: "T", x: 300, y: 300, text: "Hi", fontFamily: 5 } as never;
    const { api } = await mountEditor({
      showDeprecatedFonts: true,
      initialData: { elements: [text] },
    });
    await select(api, "T");
    await user.click(screen.getByTestId("font-family-show-fonts"));
    await settle();
    expect(screen.getByTestId(`font-family-${FONT_FAMILY.Virgil}`)).toBeDefined();
  });

  test("without showDeprecatedFonts the retired fonts are not offered", async () => {
    const text = { type: "text", id: "T", x: 300, y: 300, text: "Hi", fontFamily: 5 } as never;
    const { api } = await mountEditor({ initialData: { elements: [text] } });
    await select(api, "T");
    await user.click(screen.getByTestId("font-family-show-fonts"));
    await settle();
    expect(screen.queryByTestId(`font-family-${FONT_FAMILY.Virgil}`)).toBeNull();
  });
});

describe("the host's components", () => {
  test("a Sidebar opens from its trigger, on a tab, hears its state, and closes", async () => {
    const states: unknown[] = [];
    const { api } = await mountEditor(
      {
        renderTopRightUI: () => (
          <Sidebar.Trigger name="notes" tab="todo" title="Notes" data-testid="notes-trigger" />
        ),
      },
      () => (
        <Sidebar name="notes" onStateChange={(state) => states.push(state)} data-testid="notes">
          <Sidebar.Tabs>
            <Sidebar.Header>
              <Sidebar.TabTriggers>
                <Sidebar.TabTrigger tab="todo">To do</Sidebar.TabTrigger>
                <Sidebar.TabTrigger tab="done">Done</Sidebar.TabTrigger>
              </Sidebar.TabTriggers>
            </Sidebar.Header>
            <Sidebar.Tab tab="todo">Write the plan</Sidebar.Tab>
            <Sidebar.Tab tab="done">Nothing yet</Sidebar.Tab>
          </Sidebar.Tabs>
        </Sidebar>
      ),
    );
    expect(screen.queryByTestId("notes")).toBeNull();
    await user.click(screen.getByTestId("notes-trigger"));
    await settle();
    const notes = screen.getByTestId("notes");
    expect(api.getAppState().openSidebar).toEqual({ name: "notes", tab: "todo" });
    expect(within(notes).getByText("Write the plan")).toBeDefined();
    await user.click(within(notes).getByRole("tab", { name: "Done" }));
    await settle();
    expect(api.getAppState().openSidebar).toEqual({ name: "notes", tab: "done" });
    await user.click(within(notes).getByTestId("sidebar-close"));
    await settle();
    expect(screen.queryByTestId("notes")).toBeNull();
    expect(states).toEqual([{ name: "notes", tab: "todo" }, { name: "notes", tab: "done" }, null]);
  });

  test("DefaultSidebar takes the host's tabs, tab buttons and trigger, and onDock false keeps it undocked", async () => {
    const { api } = await mountEditor({}, () => (
      <>
        <DefaultSidebar onDock={false}>
          <Sidebar.Tab tab="comments">All comments</Sidebar.Tab>
        </DefaultSidebar>
        <DefaultSidebar.TabTriggers>
          <Sidebar.TabTrigger tab="comments">Comments</Sidebar.TabTrigger>
        </DefaultSidebar.TabTriggers>
        <DefaultSidebar.Trigger title="Library and comments" />
      </>
    ));
    const trigger = screen.getByTestId("sidebar-trigger");
    expect(trigger.getAttribute("title")).toBe("Library and comments");
    await user.click(trigger);
    await settle();
    const sidebar = screen.getByTestId("default-sidebar");
    expect(within(sidebar).queryByTestId("sidebar-dock")).toBeNull();
    await user.click(within(sidebar).getByRole("tab", { name: "Comments" }));
    await settle();
    expect(api.getAppState().openSidebar).toEqual({ name: "default", tab: "comments" });
    expect(within(sidebar).getByText("All comments")).toBeDefined();
  });

  test("Footer shows in the middle of the footer, with Button and Ellipsify", async () => {
    const pressed: string[] = [];
    await mountEditor({}, () => (
      <Footer>
        <Button onSelect={() => pressed.push("save")} selected data-testid="footer-save">
          <Ellipsify data-testid="footer-label">Save the release plan</Ellipsify>
        </Button>
      </Footer>
    ));
    const center = screen.getByTestId("footer-center");
    const button = within(center).getByTestId("footer-save");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("footer-label").textContent).toBe("Save the release plan");
    await user.click(button);
    expect(pressed).toEqual(["save"]);
  });

  test("Stats rows lay out what renderCustomStats adds", async () => {
    const { api } = await mountEditor({
      renderCustomStats: () => (
        <Stats.StatsRows order={-1} data-testid="custom-rows">
          <Stats.StatsRow heading>Release</Stats.StatsRow>
          <Stats.StatsRow columns={2} data-testid="custom-row">
            <span>Version</span>
            <span>2</span>
          </Stats.StatsRow>
        </Stats.StatsRows>
      ),
    });
    api.updateScene({ appState: { stats: { ...api.getAppState().stats, open: true } } });
    await settle();
    const row = screen.getByTestId("custom-row");
    expect(row.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
    expect(screen.getByTestId("custom-rows").style.order).toBe("-1");
  });

  test("CommandPalette adds the host's commands, under their category, when they apply", async () => {
    const ran: string[] = [];
    const { api } = await mountEditor({}, () => (
      <CommandPalette
        customCommandPaletteItems={[
          {
            label: "Publish to the wiki",
            category: "Acme",
            keywords: ["share"],
            perform: ({ actionManager }) =>
              ran.push(actionManager.actions.size > 0 ? "ok" : "none"),
          },
          {
            label: "Hidden command",
            category: "Acme",
            predicate: false,
            perform: () => ran.push("hidden"),
          },
        ]}
      />
    ));
    api.updateScene({ appState: { openDialog: { name: "commandPalette" } } });
    await settle();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Acme")).toBeDefined();
    expect(within(dialog).queryByText("Hidden command")).toBeNull();
    await user.click(within(dialog).getByText("Publish to the wiki"));
    await settle();
    expect(ran).toEqual(["ok"]);
  });
});

describe("hooks", () => {
  test("inside the editor: the API, the editor's interface, the styles panel's mode, the strings", async () => {
    const seen: string[] = [];
    function Probe() {
      const api = useExcalidrawAPI();
      const editorInterface = useEditorInterface();
      const mode = useStylesPanelMode();
      const { t, langCode } = useI18n();
      return (
        <span data-testid="probe">
          {`${api() ? "api" : "none"}|${editorInterface().formFactor}|${mode()}|${t("buttons.close")}|${langCode()}`}
        </span>
      );
    }
    await mountEditor({ renderTopRightUI: () => <Probe /> });
    seen.push(screen.getByTestId("probe").textContent ?? "");
    expect(seen).toEqual(["api|desktop|full|Close|en"]);
  });

  test("outside the editor under ExcalidrawAPIProvider: the API and the state, followed", async () => {
    const heard: unknown[] = [];
    function Outside() {
      const api = useExcalidrawAPI();
      const background = useExcalidrawStateValue("viewBackgroundColor");
      useOnExcalidrawStateChange("viewBackgroundColor", (value) => heard.push(value));
      return (
        <span data-testid="outside">{`${api() ? "api" : "none"}:${background() ?? "-"}`}</span>
      );
    }
    let api: DiagramEditorApi | undefined;
    render(() => (
      <ExcalidrawAPIProvider>
        <Outside />
        <DiagramEditor height={800} api={(given) => (api = given)} />
      </ExcalidrawAPIProvider>
    ));
    await settle();
    expect(screen.getByTestId("outside").textContent).toBe("api:#ffffff");
    api!.updateScene({ appState: { viewBackgroundColor: "#fafafa" } });
    await settle();
    expect(screen.getByTestId("outside").textContent).toBe("api:#fafafa");
    expect(heard).toEqual(["#fafafa"]);
  });
});
