import { Show, createMemo, createSignal } from "@barqjs/core";
import { ExternalLink } from "@barqjs/lucide/icons/external-link";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Button } from "@barqjs/ui/button";
import {
  CaptureUpdateAction,
  getElementAbsoluteCoords,
  getLinkIdAndTypeFromSelection,
  isElementLink,
  isEmbeddableElement,
} from "@excalidraw/element";
import {
  ELEMENT_LINK_KEY,
  KEYS,
  normalizeLink,
  sceneCoordsToViewportCoords,
  toValidURL,
} from "@excalidraw/common";

import { useDiagramUI } from "./context.tsx";
import { fg, gap, layout, space, truncate } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import { acrossWidth, floating, iconButton, island, takesPointer, textInput } from "./styles.ts";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

const popup = d(island, floating, gap[1], { maxWidth: "min(360px, calc(100% - 16px))" });

const linkText = d(layout.grow, layout.minZero, truncate, fg.link, { paddingInline: space.x1_5 });

const emptyText = d(layout.grow, fg.muted, { paddingInline: space.x1_5 });

const dialog = d(island, floating, acrossWidth, layout.column, gap[2], takesPointer, {
  top: space.x3,
  marginInline: "auto",
  width: "min(420px, calc(100% - 24px))",
  alignItems: "stretch",
  padding: space.x3,
});

const dialogRow = d(layout.row, layout.end, gap[2]);

const PADDING = 12;

/**
 * Excalidraw's link popup above the selected element: the link, opened in a
 * new tab (an element link scrolls to its element instead), with buttons to
 * edit and remove it; Ctrl+K opens it as an input, Enter saves and Escape
 * leaves it as it was. An embeddable's link is edited, not removed, and
 * shows only once it validates. Not shown in view mode.
 */
export function HyperlinkPopup() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  function mode() {
    return store.state("showHyperlinkPopup");
  }

  const element = createMemo((): NonDeletedExcalidrawElement | null => {
    if (!mode() || store.state("viewModeEnabled")) return null;
    const [only, ...rest] = store
      .selection()
      .elements.filter((each) => !("containerId" in each && each.containerId));
    return only && rest.length === 0 ? only : null;
  });

  // placed above the element, following the viewport
  const position = createMemo(() => {
    const target = element();
    const editor = store.editor;
    if (!target || !editor) return null;
    // the viewport only while there is a popup to place
    store.state("scrollX");
    store.state("scrollY");
    store.state("zoom");
    const [x1, y1, x2] = getElementAbsoluteCoords(target, editor.scene.getNonDeletedElementsMap());
    const { x, y } = sceneCoordsToViewportCoords(
      { sceneX: (x1 + x2) / 2, sceneY: y1 },
      editor.state,
    );
    return {
      left: `${Math.max(PADDING, x - editor.state.offsetLeft - 120)}px`,
      top: `${Math.max(PADDING, y - editor.state.offsetTop - 56)}px`,
    };
  });

  function save(value: string): void {
    const target = element();
    const editor = store.editor;
    if (!target || !editor) return;
    const link = value.trim() ? normalizeLink(value.trim()) : null;
    editor.batch(() => {
      editor.store.scheduleAction(CaptureUpdateAction.IMMEDIATELY);
      if (isEmbeddableElement(target)) {
        editor.embeds.submitLink(target, link);
        editor.setState({ showHyperlinkPopup: "info" });
        return;
      }
      editor.scene.mutateElement(target, { link });
      editor.setState({ showHyperlinkPopup: link ? "info" : false });
    });
  }

  return (
    <Show when={element() && position()}>
      <div class={popup} style={position()!} data-testid="hyperlink-popup">
        <Show
          when={mode() === "editor"}
          fallback={
            <>
              <Show
                when={element()!.link}
                fallback={<span class={emptyText}>{t("labels.link.empty")}</span>}
              >
                <a
                  class={linkText}
                  href={toValidURL(element()!.link ?? "")}
                  target={isElementLink(element()!.link ?? "") ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  onClick={(event: MouseEvent) => {
                    const link = element()!.link ?? "";
                    const editor = store.editor;
                    if (!editor) return;
                    if (editor.notifyLinkOpen(element()!, event)) {
                      event.preventDefault();
                    } else if (isElementLink(link)) {
                      event.preventDefault();
                      editor.batch(() => editor.scrollToElementLink(link));
                    }
                  }}
                  data-testid="hyperlink-link"
                >
                  <Show when={isElementLink(element()!.link ?? "")} fallback={element()!.link}>
                    {t("labels.link.goToElement")}
                  </Show>
                </a>
              </Show>
              <button
                type="button"
                class={iconButton}
                aria-label={t("buttons.edit")}
                title={t("buttons.edit")}
                onClick={() =>
                  store.editor?.batch(() =>
                    store.editor?.setState({ showHyperlinkPopup: "editor" }),
                  )
                }
                data-testid="hyperlink-edit"
              >
                <Pencil aria-hidden="true" />
              </button>
              <Show when={element()!.link && !isEmbeddableElement(element())}>
                <button
                  type="button"
                  class={iconButton}
                  aria-label={t("buttons.remove")}
                  title={t("buttons.remove")}
                  onClick={() => save("")}
                  data-testid="hyperlink-remove"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </Show>
            </>
          }
        >
          <input
            class={textInput}
            aria-label={t("labels.link.label")}
            placeholder={t("labels.link.hint")}
            value={element()!.link ?? ""}
            ref={(input: HTMLInputElement) =>
              queueMicrotask(() => {
                input.focus();
                input.select();
              })
            }
            onKeyDown={(event: KeyboardEvent) => {
              const input = event.currentTarget as HTMLInputElement;
              if (event.key === KEYS.ENTER) {
                event.preventDefault();
                save(input.value);
                ui.focusCanvas();
              } else if (event.key === KEYS.ESCAPE) {
                event.preventDefault();
                store.editor?.batch(() =>
                  store.editor?.setState({ showHyperlinkPopup: element()?.link ? "info" : false }),
                );
                ui.focusCanvas();
              }
            }}
            onBlur={(event: FocusEvent) => {
              if (mode() === "editor") save((event.currentTarget as HTMLInputElement).value);
            }}
            data-testid="hyperlink-input"
          />
          <Show when={element()!.link && !isElementLink(element()!.link ?? "")}>
            <a
              class={iconButton}
              href={toValidURL(element()!.link ?? "")}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("labels.link.label")}
            >
              <ExternalLink aria-hidden="true" />
            </a>
          </Show>
        </Show>
      </div>
    </Show>
  );
}

/**
 * Excalidraw's element link editor: while it is open, the element clicked on
 * the canvas is the link's target; Confirm links the source element to it,
 * Remove clears the link and Cancel or Escape leaves it.
 */
export function ElementLinkDialog() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  function dialogState() {
    const open = store.state("openDialog");
    return open?.name === "elementLinkSelector" ? open : null;
  }
  const [edited, setEdited] = createSignal<string | null | undefined>(undefined);

  const generated = createMemo((): string | null => {
    const editor = store.editor;
    const selected = store.selection().elements;
    if (!editor || selected.length === 0) return null;
    const idAndType = getLinkIdAndTypeFromSelection([...selected], editor.state);
    if (!idAndType) return null;
    if (editor.host.generateLinkForSelection) {
      return editor.host.generateLinkForSelection(idAndType.id, idAndType.type);
    }
    const url = new URL(window.location.href);
    url.searchParams.set(ELEMENT_LINK_KEY, idAndType.id);
    return url.toString();
  });
  const source = createMemo(() => {
    const open = dialogState();
    return open ? (store.editor?.scene.getNonDeletedElement(open.sourceElementId) ?? null) : null;
  });
  function link(): string | null {
    const value = edited();
    if (value !== undefined) return value;
    return generated() ?? source()?.link ?? null;
  }

  function close(): void {
    setEdited(undefined);
    const editor = store.editor;
    const sourceElement = source();
    editor?.batch(() => {
      editor.setState({ openDialog: null });
      if (sourceElement) editor.selection.select(sourceElement);
    });
    ui.focusCanvas();
  }
  function confirm(): void {
    const editor = store.editor;
    const sourceElement = source();
    if (editor && sourceElement) {
      const next = link();
      editor.batch(() => {
        editor.store.scheduleAction(CaptureUpdateAction.IMMEDIATELY);
        editor.scene.mutateElement(sourceElement, {
          link: next && isElementLink(next) ? next : next ? normalizeLink(next) : null,
        });
      });
    }
    close();
  }

  return (
    <Show when={dialogState()}>
      <div
        class={dialog}
        role="dialog"
        aria-label={t("elementLink.title")}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === KEYS.ESCAPE) {
            event.preventDefault();
            close();
          }
        }}
        data-testid="element-link-dialog"
      >
        <strong>{t("elementLink.title")}</strong>
        <span>{t("elementLink.desc")}</span>
        <input
          class={textInput}
          aria-label={t("elementLink.title")}
          value={link() ?? ""}
          placeholder={t("labels.link.hint")}
          onInput={(event: InputEvent) =>
            setEdited((event.currentTarget as HTMLInputElement).value)
          }
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === KEYS.ENTER) {
              event.preventDefault();
              confirm();
            }
          }}
          data-testid="element-link-input"
        />
        <div class={dialogRow}>
          <Button variant="ghost" onPress={() => setEdited(null)}>
            {t("buttons.remove")}
          </Button>
          <Button variant="outline" onPress={close}>
            {t("buttons.cancel")}
          </Button>
          <Button onPress={confirm} data-testid="element-link-confirm">
            {t("buttons.confirm")}
          </Button>
        </div>
      </div>
    </Show>
  );
}
