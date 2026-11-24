import { For, Show, createMemo, createSignal, onCleanup } from "@barqjs/core";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { FolderOpen } from "@barqjs/lucide/icons/folder-open";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Send } from "@barqjs/lucide/icons/send";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Upload } from "@barqjs/lucide/icons/upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@barqjs/ui/alert-dialog";
import { Button } from "@barqjs/ui/button";
import { Checkbox } from "@barqjs/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Input } from "@barqjs/ui/input";
import { KEYS, LIBRARY_DISABLED_TYPES, MIME_TYPES, VERSIONS, randomId } from "@excalidraw/common";

import { fileOpen } from "../data/filesystem.ts";
import { saveLibraryAsJSON } from "../data/files.ts";
import { exportToSvg } from "../export.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { PublishLibraryDialog } from "./publish-library.tsx";
import { iconButton, menuItem, menuSurface } from "./styles.ts";

import type { NonDeleted, ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawLibraryIds } from "../data/types.ts";
import type { DiagramEditor } from "../editor/editor.ts";
import type { LibraryState } from "../editor/library.ts";
import type { LibraryItem, LibraryItems } from "../types.ts";

/** Where the browse button takes the reader: Excalidraw's public library site, which installs back by URL. */
export const LIBRARY_URL = "https://libraries.excalidraw.com";

const container = d({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  minHeight: "0",
  flex: "1",
});

const header = d({ display: "flex", alignItems: "center", gap: "4px" });

const counter = d({
  minWidth: "18px",
  paddingInline: "4px",
  borderRadius: "9px",
  textAlign: "center",
  fontSize: "var(--text-xs)",
  backgroundColor: "var(--brand, var(--primary))",
  color: "var(--brand-ink, var(--primary-foreground))",
});

const items = d({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  overflowY: "auto",
  minHeight: "0",
  flex: "1",
});

const sectionHeading = d({
  margin: "0",
  fontSize: "var(--text-xs)",
  fontWeight: "600",
  color: "var(--muted-foreground)",
});

const grid = d({
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: "6px",
  margin: "0",
  padding: "0",
  listStyle: "none",
  "&[data-named]": { gridTemplateColumns: "repeat(2, 1fr)" },
});

const unit = d({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  "& > [data-slot=checkbox]": {
    position: "absolute",
    top: "4px",
    insetInlineEnd: "4px",
    opacity: "0",
  },
  "&:hover > [data-slot=checkbox], &:focus-within > [data-slot=checkbox], &[data-selected] > [data-slot=checkbox]":
    { opacity: "1" },
  "@media (pointer: coarse)": { "& > [data-slot=checkbox]": { opacity: "1" } },
});

const preview = d({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  aspectRatio: "1",
  width: "100%",
  padding: "6px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  "& svg": { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" },
  "&:hover": { backgroundColor: "var(--accent)" },
  "&:focus-visible": { outline: "2px solid var(--ring)", outlineOffset: "1px" },
  "[data-selected] > &": { borderColor: "var(--brand, var(--primary))" },
  "&[data-pending]": { borderStyle: "dashed" },
});

const itemName = d({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "var(--text-xs)",
  textAlign: "center",
});

const hint = d({
  margin: "0",
  fontSize: "var(--text-xs)",
  color: "var(--muted-foreground)",
});

const browse = d({
  display: "block",
  padding: "8px",
  borderRadius: "var(--radius)",
  textAlign: "center",
  color: "inherit",
  backgroundColor: "var(--muted)",
  textDecoration: "none",
  "&:hover": { backgroundColor: "var(--accent)" },
});

const deburr = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Each item's drawing, made once: an item's elements do not change under its id. */
const svgCache = new Map<string, SVGSVGElement>();

const itemSvg = async (
  id: string | null,
  elements: LibraryItem["elements"],
): Promise<SVGSVGElement> => {
  const cached = id === null ? undefined : svgCache.get(id);
  if (cached) return cached;
  const svg = await exportToSvg({
    elements,
    files: null,
    appState: { exportBackground: false },
    skipInliningFonts: true,
  });
  svg.querySelector(".style-fonts")?.remove();
  svg.setAttribute("aria-hidden", "true");
  if (id !== null) svgCache.set(id, svg);
  return svg;
};

/** Drops the drawings of items no longer in the library. */
const forgetSvgs = (ids: readonly string[]): void => {
  for (const id of ids) svgCache.delete(id);
};

/** An item's drawing, in an element of its own as it arrives. */
function ItemPreview(props: { id: string | null; elements: LibraryItem["elements"] }) {
  return (
    <span
      style="display:contents"
      ref={(host: HTMLSpanElement) => {
        let live = true;
        onCleanup(() => {
          live = false;
        });
        void itemSvg(props.id, props.elements).then(
          (svg) => {
            if (live) host.replaceChildren(props.id === null ? svg : svg.cloneNode(true));
          },
          (error: unknown) => console.error(error),
        );
      }}
    />
  );
}

/** The library's items as the sidebar's library tab shows and manages them, Excalidraw's `LibraryMenu`. */
export function LibraryMenu(props: { editor: DiagramEditor }) {
  const ui = useDiagramUI();
  const t = ui.t;
  const editor = props.editor;
  const library = editor.library;

  const [state, setState] = createSignal<LibraryState>(library.state);
  const off = library.onStateChange((next) => queueMicrotask(() => setState(next)));
  onCleanup(off);

  const [selected, setSelected] = createSignal<readonly string[]>([]);
  const [search, setSearch] = createSignal("");
  const [confirming, setConfirming] = createSignal(false);
  const [publishing, setPublishing] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);
  let lastSelected: string | null = null;
  // whether Shift is down as a checkbox toggles, which its change does not say
  let shiftHeld = false;
  const noteShift = (event: PointerEvent | KeyboardEvent): void => {
    shiftHeld = event.shiftKey;
  };
  editor.ownerDocument.addEventListener("pointerdown", noteShift, true);
  editor.ownerDocument.addEventListener("keydown", noteShift, true);
  onCleanup(() => {
    editor.ownerDocument.removeEventListener("pointerdown", noteShift, true);
    editor.ownerDocument.removeEventListener("keydown", noteShift, true);
  });

  // what the selection would add: re-read as the panels read it, between gestures
  const pending = createMemo((): readonly NonDeleted<ExcalidrawElement>[] => {
    ui.store.selection();
    return editor.scene.getSelectedElements({
      selectedElementIds: editor.state.selectedElementIds,
      includeBoundTextElement: true,
      includeElementsInFrames: true,
    });
  });

  const libraryItems = () => state().libraryItems;
  const unpublished = createMemo(() =>
    libraryItems().filter((item) => item.status !== "published"),
  );
  const published = createMemo(() => libraryItems().filter((item) => item.status === "published"));
  const isEmpty = () => libraryItems().length === 0 && pending().length === 0;
  const query = () => deburr(search().trim().toLowerCase());
  const isSearching = () => !isEmpty() && query() !== "";
  const filtered = createMemo(() =>
    query() === ""
      ? []
      : libraryItems().filter((item) => {
          const name = item.name ?? "";
          return name.trim() !== "" && deburr(name.toLowerCase()).includes(query());
        }),
  );
  const selectedItems = () => libraryItems().filter((item) => selected().includes(item.id));
  const isSelected = (id: string) => selected().includes(id);

  const toggle = (id: string, shift: boolean): void => {
    const current = selected();
    if (current.includes(id)) {
      lastSelected = null;
      setSelected(current.filter((each) => each !== id));
      return;
    }
    const ordered = [...unpublished(), ...published()];
    const start =
      lastSelected === null ? -1 : ordered.findIndex((item) => item.id === lastSelected);
    const end = ordered.findIndex((item) => item.id === id);
    if (shift && start !== -1 && end !== -1) {
      const [from, to] = start < end ? [start, end] : [end, start];
      setSelected(
        ordered
          .filter((item, index) => (index >= from && index <= to) || current.includes(item.id))
          .map((item) => item.id),
      );
    } else {
      setSelected([...current, id]);
    }
    lastSelected = id;
  };

  const clearSelection = (): void => {
    lastSelected = null;
    setSelected([]);
  };

  const insert = (id: string): void => {
    const ids = isSelected(id) ? selected() : [id];
    const chosen = libraryItems().filter((item) => ids.includes(item.id));
    editor.batch(() => editor.insertLibraryItems(chosen));
    editor.focusContainer();
  };

  const addPending = (): void => {
    const elements = pending();
    for (const type of LIBRARY_DISABLED_TYPES) {
      if (elements.some((element) => element.type === type)) {
        editor.batch(() =>
          editor.setState({ errorMessage: { key: `errors.libraryElementTypeError.${type}` } }),
        );
        return;
      }
    }
    const nextItems: LibraryItems = [
      { status: "unpublished", elements, id: randomId(), created: Date.now() },
      ...libraryItems(),
    ];
    editor.batch(() =>
      editor.setState({ selectedElementIds: {}, selectedGroupIds: {}, activeEmbeddable: null }),
    );
    library.setLibrary(nextItems).catch(() => {
      editor.batch(() => editor.setState({ errorMessage: { key: "alerts.errorAddingToLibrary" } }));
    });
  };

  const removeSelected = (): void => {
    const ids = selected();
    library.setLibrary(libraryItems().filter((item) => !ids.includes(item.id))).catch(() => {
      editor.batch(() =>
        editor.setState({ errorMessage: { key: "alerts.errorRemovingFromLibrary" } }),
      );
    });
    forgetSvgs(ids);
    clearSelection();
  };

  const reset = (): void => {
    forgetSvgs(libraryItems().map((item) => item.id));
    void library.resetLibrary();
  };

  const importLibrary = async (): Promise<void> => {
    try {
      await library.updateLibrary({
        libraryItems: fileOpen({ description: "Excalidraw library files" }),
        merge: true,
        openLibraryMenu: true,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      editor.batch(() => editor.setState({ errorMessage: { key: "errors.importLibraryError" } }));
    }
  };

  const exportLibrary = async (): Promise<void> => {
    const chosen = selected().length > 0 ? selectedItems() : await library.getLatestLibrary();
    try {
      await saveLibraryAsJSON(chosen);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      editor.batch(() =>
        editor.setState({ errorMessage: error instanceof Error ? error.message : String(error) }),
      );
    }
  };

  const onDragStart = (id: string, event: DragEvent): void => {
    const data: ExcalidrawLibraryIds = { itemIds: isSelected(id) ? [...selected()] : [id] };
    event.dataTransfer?.setData(MIME_TYPES.excalidrawlibIds, JSON.stringify(data));
  };

  const browseUrl = (): string => {
    const view = editor.ownerWindow;
    const referrer = ui.host().libraryReturnUrl ?? view.location.origin + view.location.pathname;
    return `${LIBRARY_URL}?target=${view.name || "_blank"}&referrer=${referrer}&useHash=true&token=${
      editor.id
    }&theme=${ui.store.state("theme")}&version=${VERSIONS.excalidrawLibrary}`;
  };

  const Unit = (unitProps: { item: LibraryItem; showName?: boolean }) => {
    const item = unitProps.item;
    const name = item.name?.trim()
      ? item.name
      : t("library.unnamedItem", {
          number: libraryItems().findIndex((each) => each.id === item.id) + 1,
        });
    return (
      <li
        class={unit}
        data-selected={isSelected(item.id) ? "" : undefined}
        data-testid="library-unit"
      >
        <button
          type="button"
          class={preview}
          draggable
          aria-label={name}
          title={item.name}
          onClick={(event: MouseEvent) => {
            if (event.shiftKey) toggle(item.id, true);
            else insert(item.id);
          }}
          onDragStart={(event: DragEvent) => onDragStart(item.id, event)}
        >
          <ItemPreview id={item.id} elements={item.elements} />
        </button>
        <Show when={unitProps.showName}>
          <span class={itemName}>{name}</span>
        </Show>
        <Checkbox
          aria-label={t("library.selectItem", { name })}
          isSelected={isSelected(item.id)}
          onChange={() => {
            toggle(item.id, shiftHeld);
            shiftHeld = false;
          }}
          data-testid="library-unit-checkbox"
        />
      </li>
    );
  };

  const BrowseButton = () => (
    <a
      class={browse}
      href={browseUrl()}
      target="_excalidraw_libraries"
      data-testid="library-browse"
    >
      {t("labels.libraries")}
    </a>
  );

  return (
    <div
      class={container}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === KEYS.ESCAPE && selected().length > 0) {
          event.stopPropagation();
          clearSelection();
        }
      }}
      data-testid="library-menu"
    >
      <div class={header}>
        <Show when={!isEmpty()}>
          <Input
            type="search"
            aria-label={t("library.search.inputPlaceholder")}
            placeholder={t("library.search.inputPlaceholder")}
            value={search()}
            onInput={(event: Event) => setSearch((event.currentTarget as HTMLInputElement).value)}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key === KEYS.ESCAPE && search()) {
                event.preventDefault();
                event.stopPropagation();
                setSearch("");
              }
            }}
            data-testid="library-search"
          />
        </Show>
        <DropdownMenu isOpen={menuOpen()} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size="icon"
              class={iconButton}
              aria-label={t("labels.libraries")}
              title={t("labels.libraries")}
              data-testid="library-menu-trigger"
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class={menuSurface} side="bottom" align="end">
            <Show when={selected().length === 0}>
              <DropdownMenuItem
                class={menuItem}
                onAction={() => void importLibrary()}
                data-testid="lib-dropdown--load"
              >
                <FolderOpen aria-hidden="true" />
                <span>{t("buttons.load")}</span>
              </DropdownMenuItem>
            </Show>
            <Show when={libraryItems().length > 0}>
              <DropdownMenuItem
                class={menuItem}
                onAction={() => void exportLibrary()}
                data-testid="lib-dropdown--export"
              >
                <Upload aria-hidden="true" />
                <span>{t("buttons.export")}</span>
              </DropdownMenuItem>
            </Show>
            <Show when={selected().length > 0 && ui.host().libraryPublishEndpoint}>
              <DropdownMenuItem
                class={menuItem}
                onAction={() => setPublishing(true)}
                data-testid="lib-dropdown--publish"
              >
                <Send aria-hidden="true" />
                <span>{t("buttons.publishLibrary")}</span>
              </DropdownMenuItem>
            </Show>
            <Show when={libraryItems().length > 0}>
              <DropdownMenuItem
                class={menuItem}
                variant="destructive"
                onAction={() => setConfirming(true)}
                data-testid="lib-dropdown--remove"
              >
                <Trash2 aria-hidden="true" />
                <span>
                  {selected().length > 0 ? t("buttons.remove") : t("buttons.resetLibrary")}
                </span>
              </DropdownMenuItem>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
        <Show when={selected().length > 0}>
          <span class={counter} data-testid="library-selected-count">
            {selected().length}
          </span>
        </Show>
      </div>

      <div class={items}>
        <Show when={state().status === "loading" && !state().isInitialized}>
          <p class={hint} role="status">
            {t("labels.libraryLoadingMessage")}
          </p>
        </Show>
        <Show
          when={isSearching()}
          fallback={
            <>
              <Show when={!isEmpty()}>
                <h3 class={sectionHeading}>{t("labels.personalLib")}</h3>
              </Show>
              <Show
                when={pending().length > 0 || unpublished().length > 0}
                fallback={
                  <div>
                    <Show when={published().length === 0}>
                      <p class={hint}>{t("library.noItems")}</p>
                    </Show>
                    <p class={hint}>
                      {published().length > 0
                        ? t("library.hint_emptyPrivateLibrary")
                        : t("library.hint_emptyLibrary")}
                    </p>
                  </div>
                }
              >
                <ul class={grid} aria-label={t("labels.personalLib")}>
                  <Show when={pending().length > 0}>
                    <li class={unit}>
                      <button
                        type="button"
                        class={preview}
                        data-pending=""
                        aria-label={t("labels.addToLibrary")}
                        title={t("labels.addToLibrary")}
                        onClick={addPending}
                        data-testid="library-add-pending"
                      >
                        <Plus aria-hidden="true" />
                      </button>
                    </li>
                  </Show>
                  <For each={unpublished()} keyed={(item) => item.id}>
                    {(item) => <Unit item={item()} />}
                  </For>
                </ul>
              </Show>
              <Show when={published().length > 0}>
                <h3 class={sectionHeading}>{t("labels.excalidrawLib")}</h3>
                <ul class={grid} aria-label={t("labels.excalidrawLib")}>
                  <For each={published()} keyed={(item) => item.id}>
                    {(item) => <Unit item={item()} />}
                  </For>
                </ul>
              </Show>
            </>
          }
        >
          <h3 class={sectionHeading}>{t("library.search.heading")}</h3>
          <Show
            when={filtered().length > 0}
            fallback={
              <div>
                <p class={hint}>{t("library.search.noResults")}</p>
                <Button variant="secondary" onPress={() => setSearch("")}>
                  {t("library.search.clearSearch")}
                </Button>
              </div>
            }
          >
            <ul class={grid} data-named="" aria-label={t("library.search.heading")}>
              <For each={filtered()} keyed={(item) => item.id}>
                {(item) => <Unit item={item()} showName />}
              </For>
            </ul>
          </Show>
        </Show>
      </div>

      <BrowseButton />

      <AlertDialog isOpen={confirming()} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected().length > 0
                ? t("confirmDialog.removeItemsFromLib")
                : t("confirmDialog.resetLibrary")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selected().length > 0
                ? t("alerts.removeItemsFromsLibrary", { count: selected().length })
                : t("alerts.resetLibrary")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setConfirming(false)}>
              {t("buttons.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onPress={() => {
                setConfirming(false);
                if (selected().length > 0) removeSelected();
                else reset();
              }}
              data-testid="confirm-library-remove"
            >
              {t("buttons.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Show when={publishing()}>
        <PublishLibraryDialog
          editor={editor}
          items={selectedItems()}
          onClose={() => setPublishing(false)}
          onRemove={(id) => setSelected(selected().filter((each) => each !== id))}
          onPublished={(publishedIds) => {
            void library.setLibrary((current) =>
              current.map((item) =>
                publishedIds.includes(item.id) ? { ...item, status: "published" } : item,
              ),
            );
          }}
        />
      </Show>
    </div>
  );
}
