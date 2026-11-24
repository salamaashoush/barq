import { For, Show, createSignal, onCleanup } from "@barqjs/core";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronUp } from "@barqjs/lucide/icons/chevron-up";
import { Frame } from "@barqjs/lucide/icons/frame";
import { Text } from "@barqjs/lucide/icons/text";
import { Input } from "@barqjs/ui/input";
import { KEYS } from "@excalidraw/common";
import { isElementCompletelyInViewport, isFrameLikeElement } from "@excalidraw/element";

import { type SearchMatchItem, matchAsElement, searchScene } from "../editor/search.ts";
import { fitToContent } from "../navigation.ts";
import { useDiagramUI } from "./context.tsx";
import { diagramLayer as d } from "./layer.ts";
import { iconButton } from "./styles.ts";

import type { DiagramEditor } from "../editor/editor.ts";

/** How long typing pauses before the canvas is searched again. */
const SEARCH_DEBOUNCE = 350;

/** Below this size on screen a focused match is zoomed to, to be read. */
const FONT_SIZE_LEGIBILITY_THRESHOLD = 14;

const container = d({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  minHeight: "0",
  flex: "1",
});

const count = d({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: "32px",
  fontSize: "var(--text-xs)",
  color: "var(--muted-foreground)",
});

const results = d({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  overflowY: "auto",
  minHeight: "0",
});

const groupTitle = d({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  margin: "0",
  fontSize: "var(--text-xs)",
  fontWeight: "600",
  "& svg": { width: "14px", height: "14px" },
});

const list = d({ margin: "0", padding: "0", listStyle: "none" });

const resultItem = d({
  display: "block",
  width: "100%",
  padding: "6px 8px",
  border: "none",
  borderRadius: "var(--radius)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontSize: "var(--text-sm)",
  textAlign: "start",
  cursor: "pointer",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  "&:hover": { backgroundColor: "var(--accent)" },
  "&[aria-current=true]": { backgroundColor: "var(--accent)" },
  "&:focus-visible": { outline: "2px solid var(--ring)" },
});

/**
 * Excalidraw's search, the sidebar's search tab: the canvas's texts and
 * frames' names matching what is typed, highlighted on the canvas
 * (`searchMatches`), the focused one brought into view. Enter and the down
 * arrow step to the next match, Shift+Enter and the up arrow to the previous;
 * Escape closes the sidebar.
 */
export function SearchMenu(props: { editor: DiagramEditor }) {
  const ui = useDiagramUI();
  const t = ui.t;
  const editor = props.editor;

  const [query, setQuery] = createSignal("");
  const [matches, setMatches] = createSignal<readonly SearchMatchItem[]>([]);
  const [searched, setSearched] = createSignal(false);
  const [focusIndex, setFocusIndex] = createSignal<number | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let searchedNonce: number | undefined;
  let searchedQuery: string | null = null;

  const publish = (items: readonly SearchMatchItem[], focus: number | null): void => {
    editor.batch(() =>
      editor.setState({
        searchMatches: items.length
          ? {
              focusedId: focus === null ? null : (items[focus]?.element.id ?? null),
              matches: items.map((item, index) => ({
                id: item.element.id,
                focus: index === focus,
                matchedLines: item.matchedLines,
              })),
            }
          : null,
      }),
    );
  };

  const reveal = (match: SearchMatchItem | undefined): void => {
    if (!match) return;
    const state = editor.state;
    const element = matchAsElement(match);
    const isTextTiny = element.fontSize * state.zoom.value < FONT_SIZE_LEGIBILITY_THRESHOLD;
    if (
      isTextTiny ||
      !isElementCompletelyInViewport(
        [element],
        state.width,
        state.height,
        {
          offsetLeft: state.offsetLeft,
          offsetTop: state.offsetTop,
          scrollX: state.scrollX,
          scrollY: state.scrollY,
          zoom: state.zoom,
        },
        editor.scene.getNonDeletedElementsMap(),
      )
    ) {
      editor.batch(() =>
        editor.setState(fitToContent(state, [element], isTextTiny ? "contain" : "scale-down")),
      );
    }
  };

  const focus = (index: number | null): void => {
    setFocusIndex(index);
    publish(matches(), index);
    if (index !== null) reveal(matches()[index]);
  };

  const run = (value: string): void => {
    const trimmed = value.trim();
    const visibleIds = new Set(editor.visibleElements.map((element) => element.id));
    const result = searchScene(trimmed, editor.scene.getNonDeletedElements(), {
      zoom: editor.state.zoom.value,
      visibleIds,
      renderEnvironment: editor.renderEnvironment,
    });
    searchedQuery = trimmed;
    searchedNonce = editor.scene.getSceneNonce();
    setMatches(result.matches);
    setSearched(trimmed !== "");
    const index = result.focusIndex === null || result.focusIndex < 0 ? null : result.focusIndex;
    setFocusIndex(index);
    publish(result.matches, index);
  };

  const schedule = (value: string): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      run(value);
    }, SEARCH_DEBOUNCE);
  };

  const step = (direction: 1 | -1): void => {
    const total = matches().length;
    if (total === 0) return;
    const current = focusIndex();
    focus(current === null ? 0 : (current + direction + total) % total);
  };

  // the scene changed under the results: searched again, the focus kept where it can be
  const offChange = editor.onChange(() => {
    if (searchedQuery && editor.scene.getSceneNonce() !== searchedNonce && timer === null) {
      queueMicrotask(() => {
        const keep = focusIndex();
        run(searchedQuery ?? "");
        if (keep !== null && keep < matches().length) focus(keep);
      });
    }
  });

  onCleanup(() => {
    offChange();
    if (timer !== null) clearTimeout(timer);
    if (!editor.isDestroyed) {
      editor.batch(() => editor.setState({ searchMatches: null }));
    }
  });

  const frameMatches = () =>
    matches()
      .map((match, index) => ({ match, index }))
      .filter((entry) => isFrameLikeElement(entry.match.element));
  const textMatches = () =>
    matches()
      .map((match, index) => ({ match, index }))
      .filter((entry) => !isFrameLikeElement(entry.match.element));

  const countText = () => {
    const total = matches().length;
    const label = `${total} ${total === 1 ? t("search.singleResult") : t("search.multipleResults")}`;
    const index = focusIndex();
    return index === null ? label : `${index + 1} / ${label}`;
  };

  const Item = (itemProps: { match: SearchMatchItem; index: number }) => {
    const preview = itemProps.match.preview;
    const length = itemProps.match.searchQuery.length;
    return (
      <li>
        <button
          type="button"
          class={resultItem}
          aria-current={focusIndex() === itemProps.index}
          onClick={() => focus(itemProps.index)}
          ref={(button: HTMLButtonElement) => {
            if (focusIndex() === itemProps.index) button.scrollIntoView?.({ block: "nearest" });
          }}
          data-testid="search-result"
        >
          {preview.moreBefore ? "..." : ""}
          {preview.previewText.slice(0, preview.indexInSearchQuery)}
          <b>
            {preview.previewText.slice(
              preview.indexInSearchQuery,
              preview.indexInSearchQuery + length,
            )}
          </b>
          {preview.previewText.slice(preview.indexInSearchQuery + length)}
          {preview.moreAfter ? "..." : ""}
        </button>
      </li>
    );
  };

  return (
    <div class={container} data-testid="search-menu">
      <Input
        type="search"
        data-search-menu-input=""
        aria-label={t("search.title")}
        placeholder={t("search.placeholder")}
        value={query()}
        ref={(input: HTMLInputElement) =>
          queueMicrotask(() => {
            input.focus();
            input.select();
          })
        }
        onInput={(event: Event) => {
          const value = (event.currentTarget as HTMLInputElement).value;
          setQuery(value);
          schedule(value);
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === KEYS.ENTER || event.key === KEYS.ARROW_DOWN) {
            event.preventDefault();
            event.stopPropagation();
            if (timer !== null) {
              clearTimeout(timer);
              timer = null;
              run(query());
              return;
            }
            step(event.key === KEYS.ENTER && event.shiftKey ? -1 : 1);
          } else if (event.key === KEYS.ARROW_UP) {
            event.preventDefault();
            event.stopPropagation();
            step(-1);
          } else if (event[KEYS.CTRL_OR_CMD] && event.key === KEYS.F) {
            // the page's own find stays out of the way while this one is open
            event.preventDefault();
            (event.currentTarget as HTMLInputElement).select();
          } else if (event.key === KEYS.ESCAPE) {
            event.preventDefault();
            event.stopPropagation();
            editor.batch(() => editor.setState({ openSidebar: null }));
            editor.focusContainer();
          }
        }}
        data-testid="search-input"
      />
      <div class={count} role="status" aria-live="polite">
        <Show when={matches().length > 0}>
          <span data-testid="search-count">{countText()}</span>
          <span>
            <button
              type="button"
              class={iconButton}
              aria-label={t("search.next")}
              title={t("search.next")}
              onClick={() => step(1)}
              data-testid="search-next"
            >
              <ChevronDown aria-hidden="true" />
            </button>
            <button
              type="button"
              class={iconButton}
              aria-label={t("search.previous")}
              title={t("search.previous")}
              onClick={() => step(-1)}
              data-testid="search-previous"
            >
              <ChevronUp aria-hidden="true" />
            </button>
          </span>
        </Show>
        <Show when={matches().length === 0 && searched()}>
          <span>{t("search.noMatch")}</span>
        </Show>
      </div>
      <div class={results}>
        <Show when={frameMatches().length > 0}>
          <h3 class={groupTitle}>
            <Frame aria-hidden="true" />
            {t("search.frames")}
          </h3>
          <ul class={list} aria-label={t("search.frames")}>
            <For each={frameMatches()}>
              {(entry: { match: SearchMatchItem; index: number }) => (
                <Item match={entry.match} index={entry.index} />
              )}
            </For>
          </ul>
        </Show>
        <Show when={textMatches().length > 0}>
          <h3 class={groupTitle}>
            <Text aria-hidden="true" />
            {t("search.texts")}
          </h3>
          <ul class={list} aria-label={t("search.texts")}>
            <For each={textMatches()}>
              {(entry: { match: SearchMatchItem; index: number }) => (
                <Item match={entry.match} index={entry.index} />
              )}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
}
