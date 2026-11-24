import { type Child, Show } from "@barqjs/core";
import { CircleHelp } from "@barqjs/lucide/icons/circle-help";
import { FolderOpen } from "@barqjs/lucide/icons/folder-open";

import { actionLoadScene } from "../editor/actions/export.ts";
import { actionShortcuts } from "../editor/actions/toggles.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";

const HAND_FONT = "Excalifont, Xiaolai, var(--font-sans)";

const decor = d({
  pointerEvents: "none",
  color: "var(--muted-foreground)",
  fontFamily: HAND_FONT,
});

const center = d({
  position: "absolute",
  inset: "0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "24px",
  padding: "16px",
  pointerEvents: "none",
  textAlign: "center",
});

const logo = d({ fontSize: "2.25rem", color: "var(--foreground)" });

const centerHeading = d({ fontSize: "1.25rem", maxWidth: "28rem", lineHeight: "1.4" });

const menu = d({
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  minWidth: "min(20rem, 100%)",
  pointerEvents: "auto",
});

const menuItem = d({
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "10px 12px",
  border: "none",
  borderRadius: "var(--radius)",
  background: "transparent",
  color: "var(--muted-foreground)",
  font: "inherit",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
  textDecoration: "none",
  cursor: "pointer",
  "& svg": { width: "18px", height: "18px", flexShrink: "0" },
  "&:hover, &:focus-visible": {
    backgroundColor: "var(--accent)",
    color: "var(--foreground)",
    outline: "none",
  },
  "&:focus-visible": { boxShadow: "0 0 0 2px var(--ring)" },
  "@media (pointer: coarse)": { minHeight: "44px" },
});

const menuText = d({ flexGrow: "1", textAlign: "start" });
const menuShortcut = d({ fontSize: "var(--text-xs)" });

const hint = d({
  position: "absolute",
  display: "flex",
  gap: "6px",
  fontSize: "1rem",
  lineHeight: "1.3",
  "& svg": { flexShrink: "0", overflow: "visible" },
  // the arrow's curve mirrors with the reading direction
  "[dir=rtl] & svg": { transform: "scaleX(-1)" },
});

const menuHint = d({ top: "64px", insetInlineStart: "28px", alignItems: "flex-start" });
const toolbarHint = d({
  top: "64px",
  insetInlineStart: "50%",
  transform: "translateX(-50%)",
  flexDirection: "column",
  alignItems: "center",
  "[dir=rtl] &": { transform: "translateX(50%)" },
});
const helpHint = d({ bottom: "64px", insetInlineEnd: "28px", alignItems: "flex-end" });

/** Leaves room for the hints only where the editor has it, as Excalidraw hides them on small screens. */
const roomy = (ui: ReturnType<typeof useDiagramUI>, needsWidth: boolean): boolean =>
  ui.store.state("height") >= 520 && (!needsWidth || ui.store.state("width") >= 900);

const Arrow = (props: { path: string; width: number; height: number }) => (
  <svg
    aria-hidden="true"
    width={props.width}
    height={props.height}
    viewBox={`0 0 ${props.width} ${props.height}`}
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d={props.path} />
  </svg>
);

/** The hint pointing at the main menu. */
function MenuHint(props: { children?: Child }) {
  const ui = useDiagramUI();
  return (
    <Show when={roomy(ui, true)}>
      <div class={`${decor} ${hint} ${menuHint}`} data-testid="welcome-menu-hint">
        <Arrow width={38} height={60} path="M30 58 C 8 48, 4 24, 12 4 M6 12 L12 4 L19 10" />
        <div style="max-width:160px;padding-top:36px">
          {props.children ?? ui.t("welcomeScreen.defaults.menuHint")}
        </div>
      </div>
    </Show>
  );
}

/** The hint pointing at the toolbar. */
function ToolbarHint(props: { children?: Child }) {
  const ui = useDiagramUI();
  return (
    <Show when={roomy(ui, false) && !ui.store.state("viewModeEnabled")}>
      <div class={`${decor} ${hint} ${toolbarHint}`} data-testid="welcome-toolbar-hint">
        <Arrow width={40} height={40} path="M20 38 C 22 26, 18 14, 20 2 M14 9 L20 2 L26 9" />
        <div>{props.children ?? ui.t("welcomeScreen.defaults.toolbarHint")}</div>
      </div>
    </Show>
  );
}

/** The hint pointing at the help button. */
function HelpHint(props: { children?: Child }) {
  const ui = useDiagramUI();
  return (
    <Show when={roomy(ui, true)}>
      <div class={`${decor} ${hint} ${helpHint}`} data-testid="welcome-help-hint">
        <div style="padding-bottom:28px">
          {props.children ?? ui.t("welcomeScreen.defaults.helpHint")}
        </div>
        <Arrow width={40} height={48} path="M2 6 C 22 6, 36 20, 36 44 M30 38 L36 45 L40 37" />
      </div>
    </Show>
  );
}

/** Excalidraw's `WelcomeScreen.Center.Logo`: the host's mark above the heading. */
function Logo(props: { children?: Child }) {
  return <div class={`${decor} ${logo}`}>{props.children}</div>;
}

function Heading(props: { children?: Child }) {
  return (
    <div class={`${decor} ${centerHeading}`} data-testid="welcome-heading">
      {props.children}
    </div>
  );
}

function Menu(props: { children?: Child }) {
  return (
    <div class={menu} role="group" data-testid="welcome-menu">
      {props.children}
    </div>
  );
}

function MenuItem(props: {
  onSelect: () => void;
  icon?: Child;
  shortcut?: string | null;
  children?: Child;
  "data-testid"?: string;
}) {
  return (
    <button
      type="button"
      class={menuItem}
      onClick={() => props.onSelect()}
      data-testid={props["data-testid"]}
    >
      {props.icon}
      <span class={menuText}>{props.children}</span>
      <Show when={props.shortcut}>
        <kbd class={menuShortcut}>{props.shortcut}</kbd>
      </Show>
    </button>
  );
}

function MenuItemLink(props: {
  href: string;
  icon?: Child;
  shortcut?: string | null;
  children?: Child;
}) {
  return (
    <a class={menuItem} href={props.href} target="_blank" rel="noopener">
      {props.icon}
      <span class={menuText}>{props.children}</span>
      <Show when={props.shortcut}>
        <kbd class={menuShortcut}>{props.shortcut}</kbd>
      </Show>
    </a>
  );
}

function MenuItemHelp() {
  const ui = useDiagramUI();
  return (
    <MenuItem
      onSelect={() => ui.run(actionShortcuts)}
      shortcut="?"
      icon={<CircleHelp aria-hidden="true" />}
      data-testid="welcome-help"
    >
      {ui.t("helpDialog.title")}
    </MenuItem>
  );
}

function MenuItemLoadScene() {
  const ui = useDiagramUI();
  return (
    <Show when={ui.isEnabled(actionLoadScene)}>
      <MenuItem
        onSelect={() => ui.run(actionLoadScene)}
        shortcut={ui.shortcut("loadScene")}
        icon={<FolderOpen aria-hidden="true" />}
        data-testid="welcome-load"
      >
        {ui.t("buttons.load")}
      </MenuItem>
    </Show>
  );
}

/** The middle of the welcome screen: a heading and a menu, or the host's own parts. */
function Center(props: { children?: Child }) {
  const ui = useDiagramUI();
  return (
    <div class={center} data-testid="welcome-center">
      {props.children ?? (
        <>
          <Heading>{ui.t("welcomeScreen.defaults.center_heading")}</Heading>
          <Menu>
            <MenuItemLoadScene />
            <MenuItemHelp />
          </Menu>
        </>
      )}
    </div>
  );
}

/**
 * Excalidraw's welcome screen, shown over a scene that has never had an
 * element while the selection tool is active: a heading and a menu in the
 * middle, and hints pointing at the main menu, the toolbar and help. An app
 * passes `welcomeScreen` to `<DiagramEditor>`: `true` for these defaults, or
 * a function returning `WelcomeScreen` parts.
 *
 * ```tsx
 * <DiagramEditor
 *   welcomeScreen={() => (
 *     <>
 *       <WelcomeScreen.Center>
 *         <WelcomeScreen.Center.Logo><MyMark /></WelcomeScreen.Center.Logo>
 *         <WelcomeScreen.Center.Heading>Sketch the release</WelcomeScreen.Center.Heading>
 *         <WelcomeScreen.Center.Menu>
 *           <WelcomeScreen.Center.MenuItemLoadScene />
 *           <WelcomeScreen.Center.MenuItemHelp />
 *         </WelcomeScreen.Center.Menu>
 *       </WelcomeScreen.Center>
 *       <WelcomeScreen.Hints.ToolbarHint />
 *     </>
 *   )}
 * />
 * ```
 */
export const WelcomeScreen = Object.assign(
  (props: { children?: Child }) => (
    <>
      {props.children ?? (
        <>
          <Center />
          <MenuHint />
          <ToolbarHint />
          <HelpHint />
        </>
      )}
    </>
  ),
  {
    Center: Object.assign(Center, {
      Logo,
      Heading,
      Menu,
      MenuItem,
      MenuItemLink,
      MenuItemHelp,
      MenuItemLoadScene,
    }),
    Hints: { MenuHint, ToolbarHint, HelpHint },
  },
);

const layer = d({ position: "absolute", inset: "0", pointerEvents: "none" });

/** The welcome screen when the editor is empty and waiting, Excalidraw's `renderWelcomeScreen`. */
export function WelcomeScreenLayer(props: { content: true | (() => Child) }) {
  const ui = useDiagramUI();
  const store = ui.store;
  const shown = () =>
    store.ready() &&
    store.sceneEmpty() &&
    !store.state("isLoading") &&
    !store.state("zenModeEnabled") &&
    store.state("activeTool").type === store.state("preferredSelectionTool").type;
  return (
    <Show when={shown()}>
      <div class={layer} data-testid="welcome-screen">
        {props.content === true ? <WelcomeScreen /> : props.content()}
      </div>
    </Show>
  );
}
