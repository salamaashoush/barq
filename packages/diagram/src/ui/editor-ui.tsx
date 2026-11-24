import { type Child, Show, provide } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";

import { DiagramUIContext, type DiagramUI, useDiagramUI } from "./context.tsx";
import { ContextMenu } from "./context-menu.tsx";
import { FooterEnd, FooterStart } from "./footer.tsx";
import { MainMenuButton } from "./main-menu.tsx";
import { PropertiesPanel } from "./properties.tsx";
import { bottomEnd, bottomStart, layerUI, topCenter, topEnd, topStart } from "./styles.ts";
import { Toolbar } from "./toolbar.tsx";

export interface EditorUIProps {
  ui: DiagramUI;
  /** The main menu's entries, replacing Excalidraw's defaults. */
  mainMenu?: Child;
}

/**
 * The editor's UI over its canvases, laid out as Excalidraw's: the main menu
 * and the properties panel at the top start, the toolbar in the middle, the
 * host's own UI and the stats at the top end, zoom and history at the bottom
 * start and help at the bottom end. It runs in the language's direction, so
 * a right-to-left language mirrors it; the canvas is drawn as it is.
 */
export function EditorUI(props: EditorUIProps) {
  return provide(
    DiagramUIContext,
    () => props.ui,
    () => <Layout mainMenu={props.mainMenu} />,
  );
}

function Layout(props: { mainMenu?: Child }) {
  const value = useDiagramUI();
  const locale = provideLocale(() => value.langCode());
  const zen = () => value.store.state("zenModeEnabled");
  const viewMode = () => value.store.state("viewModeEnabled");
  return (
    <div
      class={layerUI}
      lang={locale.lang()}
      dir={locale.dir()}
      data-diagram-ui=""
      data-testid="editor-ui"
    >
      <div class={topStart}>
        {value.host().renderTopLeftUI?.(false, value.store.snapshot)}
        <Show when={!zen()}>
          <MainMenuButton items={props.mainMenu} />
          <PropertiesPanel />
        </Show>
      </div>
      <Show when={!viewMode()}>
        <div class={topCenter}>
          <Toolbar />
        </div>
      </Show>
      <div class={topEnd}>{value.host().renderTopRightUI?.(false, value.store.snapshot)}</div>
      <Show when={!zen()}>
        <div class={bottomStart}>
          <FooterStart />
        </div>
        <div class={bottomEnd}>
          <FooterEnd />
        </div>
      </Show>
      <ContextMenu />
    </div>
  );
}
