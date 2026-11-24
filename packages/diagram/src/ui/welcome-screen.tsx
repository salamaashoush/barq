import type { JSX } from "@barqjs/web";
import { type Child, Show } from "@barqjs/core";
import { CircleHelp } from "@barqjs/lucide/icons/circle-help";
import { FolderOpen } from "@barqjs/lucide/icons/folder-open";

import { actionLoadScene } from "../editor/actions/export.ts";
import { actionShortcuts } from "../editor/actions/toggles.ts";
import { useDiagramUI } from "./context.tsx";
import { hostSlot, isHostChild } from "./host-children.ts";
import { bg, edge, fg, gap, interaction, layout, rounded, space, type } from "@barqjs/arc/style";
import { tokens } from "@barqjs/ui/theme/tokens";

import { diagramLayer as d } from "./layer.ts";
import {
  absolute,
  centredText,
  controlGlyph,
  cover,
  noPointer,
  pinned,
  ringed,
  takesPointer,
} from "./styles.ts";

const HAND_FONT = "Excalifont, Xiaolai, var(--font-sans)";

const decor = d(noPointer, fg.muted, { fontFamily: HAND_FONT });

const center = d(pinned, cover, layout.centre, layout.column, gap[6], centredText, {
  padding: space.x4,
});

const logo = d(decor, fg.default, { fontSize: "2.25rem" });

const centerHeading = d(decor, { fontSize: "1.25rem", maxWidth: "28rem", lineHeight: "1.4" });

const menu = d(layout.column, gap[0.5], takesPointer, { minWidth: "min(20rem, 100%)" });

const menuItem = d(
  layout.row,
  gap[3],
  rounded.md,
  edge.none,
  bg.transparent,
  fg.muted,
  type.sans,
  type.sm,
  interaction.pressable,
  controlGlyph,
  ringed,
  {
    padding: "10px 12px",
    textDecoration: "none",
    "& svg": { flexShrink: "0" },
    "&:hover, &:focus-visible": {
      backgroundColor: tokens.accent,
      color: tokens.foreground,
      outline: "none",
    },
    "@media (pointer: coarse)": { minHeight: "44px" },
  },
);

const menuText = d({ flexGrow: "1", textAlign: "start" });

const menuShortcut = d(type.xs);

const hint = d(decor, absolute, layout.row, gap[1.5], {
  fontSize: "1rem",
  lineHeight: "1.3",
  "& svg": { flexShrink: "0", overflow: "visible" },
  // the arrow's curve mirrors with the reading direction
  "[dir=rtl] & svg": { transform: "scaleX(-1)" },
});

const menuHint = d(hint, { top: "64px", insetInlineStart: "28px", alignItems: "flex-start" });

const toolbarHint = d(hint, layout.column, {
  top: "64px",
  insetInlineStart: "50%",
  transform: "translateX(-50%)",
  alignItems: "center",
  "[dir=rtl] &": { transform: "translateX(50%)" },
});

const helpHint = d(hint, { bottom: "64px", insetInlineEnd: "28px", alignItems: "flex-end" });

/** Leaves room for the hints only where the editor has it, as Excalidraw hides them on small screens. */
function roomy(ui: ReturnType<typeof useDiagramUI>, needsWidth: boolean): boolean {
  return ui.store.state("height") >= 520 && (!needsWidth || ui.store.state("width") >= 900);
}

interface ArrowProps {
  path: string;
  width: number;
  height: number;
}

function Arrow(props: ArrowProps) {
  return (
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
}

interface ChildrenProps {
  children?: Child;
}

/** The hint pointing at the main menu. */
function MenuHint(props: ChildrenProps) {
  const ui = useDiagramUI();
  return (
    <Show when={roomy(ui, true)}>
      <div class={menuHint} data-testid="welcome-menu-hint">
        <Arrow width={38} height={60} path="M30 58 C 8 48, 4 24, 12 4 M6 12 L12 4 L19 10" />
        <div style="max-width:160px;padding-top:36px">
          {props.children ?? ui.t("welcomeScreen.defaults.menuHint")}
        </div>
      </div>
    </Show>
  );
}

/** The hint pointing at the toolbar. */
function ToolbarHint(props: ChildrenProps) {
  const ui = useDiagramUI();
  return (
    <Show when={roomy(ui, false) && !ui.store.state("viewModeEnabled")}>
      <div class={toolbarHint} data-testid="welcome-toolbar-hint">
        <Arrow width={40} height={40} path="M20 38 C 22 26, 18 14, 20 2 M14 9 L20 2 L26 9" />
        <div>{props.children ?? ui.t("welcomeScreen.defaults.toolbarHint")}</div>
      </div>
    </Show>
  );
}

/** The hint pointing at the help button. */
function HelpHint(props: ChildrenProps) {
  const ui = useDiagramUI();
  return (
    <Show when={roomy(ui, true)}>
      <div class={helpHint} data-testid="welcome-help-hint">
        <div style="padding-bottom:28px">
          {props.children ?? ui.t("welcomeScreen.defaults.helpHint")}
        </div>
        <Arrow width={40} height={48} path="M2 6 C 22 6, 36 20, 36 44 M30 38 L36 45 L40 37" />
      </div>
    </Show>
  );
}

/** Excalidraw's `WelcomeScreen.Center.Logo`: the host's mark above the heading. */
function Logo(props: ChildrenProps) {
  return <div class={logo}>{props.children}</div>;
}

function Heading(props: ChildrenProps) {
  return (
    <div class={centerHeading} data-testid="welcome-heading">
      {props.children}
    </div>
  );
}

function Menu(props: ChildrenProps) {
  return (
    <div class={menu} role="group" data-testid="welcome-menu">
      {props.children}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  icon?: Child;
  shortcut?: string | null;
  children?: Child;
  "data-testid"?: string;
}

function MenuItem(props: MenuItemProps) {
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

interface MenuItemLinkProps {
  href: string;
  icon?: Child;
  shortcut?: string | null;
  children?: Child;
}

function MenuItemLink(props: MenuItemLinkProps) {
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
function Center(props: ChildrenProps) {
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
 * gives it to `<DiagramEditor>` as a child, empty for these defaults or with
 * the parts to show.
 *
 * ```tsx
 * <DiagramEditor>
 *   <WelcomeScreen>
 *     <WelcomeScreen.Center>
 *       <WelcomeScreen.Center.Logo><MyMark /></WelcomeScreen.Center.Logo>
 *       <WelcomeScreen.Center.Heading>Sketch the release</WelcomeScreen.Center.Heading>
 *       <WelcomeScreen.Center.Menu>
 *         <WelcomeScreen.Center.MenuItemLoadScene />
 *         <WelcomeScreen.Center.MenuItemHelp />
 *       </WelcomeScreen.Center.Menu>
 *     </WelcomeScreen.Center>
 *     <WelcomeScreen.Hints.ToolbarHint />
 *   </WelcomeScreen>
 * </DiagramEditor>
 * ```
 */
function WelcomeScreenRoot(props: ChildrenProps): JSX.Element {
  if (isHostChild()) {
    return hostSlot("welcomeScreen", {
      get children() {
        return props.children;
      },
    });
  }
  return (
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
  );
}

export const WelcomeScreen = Object.assign(WelcomeScreenRoot, {
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
});

const layer = d(pinned, cover);

export interface WelcomeScreenLayerProps {
  content: Child;
}

/** The welcome screen when the editor is empty and waiting, Excalidraw's `renderWelcomeScreen`. */
export function WelcomeScreenLayer(props: WelcomeScreenLayerProps) {
  const ui = useDiagramUI();
  const store = ui.store;
  function shown() {
    return (
      store.ready() &&
      store.sceneEmpty() &&
      !store.state("isLoading") &&
      !store.state("zenModeEnabled") &&
      store.state("activeTool").type === store.state("preferredSelectionTool").type
    );
  }
  return (
    <Show when={shown()}>
      <div class={layer} data-testid="welcome-screen">
        {props.content ?? <WelcomeScreen />}
      </div>
    </Show>
  );
}
