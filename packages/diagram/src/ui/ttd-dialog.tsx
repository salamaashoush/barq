import type { JSX } from "@barqjs/web";
import {
  type Child,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Button } from "@barqjs/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@barqjs/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@barqjs/ui/tabs";
import { Textarea } from "@barqjs/ui/textarea";
import { DEFAULT_EXPORT_PADDING, EDITOR_LS_KEYS, KEYS } from "@excalidraw/common";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { MERMAID_TO_EXCALIDRAW_CONFIG } from "../mermaid-detect.ts";
import { exportScene } from "../scene/export.ts";
import { getMermaidAutoFixCandidates } from "../ttd/mermaid-auto-fix.ts";
import {
  formatMermaidParseErrorMessage,
  getMermaidErrorLineNumber,
  isMermaidAutoFixableError,
} from "../ttd/mermaid-error.ts";
import { TextToDiagramSession, getLastAssistantMessage } from "../ttd/session.ts";
import { useDiagramUI } from "./context.tsx";
import { hostSlot, isHostChild } from "./host-children.ts";
import { readProp } from "@barqjs/core";
import { bg, edge, fg, gap, layout, rounded, space, type } from "@barqjs/arc/style";

import { diagramLayer as d } from "./layer.ts";
import { getShortcutKey } from "./shortcuts.ts";
import {
  dialogContent,
  fitted,
  grid,
  iconButton,
  menuItem,
  menuSurface,
  scrolls,
} from "./styles.ts";

import type { BinaryFiles } from "../types.ts";
import type { ChatMessage, TextToDiagramOptions } from "../ttd/types.ts";
import type { DiagramUI } from "./context.tsx";

const content = d(dialogContent, { maxWidth: "min(1200px, calc(100vw - 2rem))" });

const panels = d(grid, gap[4], {
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  minHeight: "360px",
});

const panel = d(layout.column, gap[2], layout.minZero);

const editorArea = d(layout.grow, type.mono, type.sm, { minHeight: "300px", resize: "none" });

const previewBox = d(layout.relative, layout.grow, layout.centre, edge.all, rounded.md, fitted, {
  minHeight: "300px",
  overflow: "hidden",
});

const errorText = d(fg.danger, type.sm, layout.flush, { whiteSpace: "pre-wrap" });

const muted = d(fg.muted, type.sm, layout.flush);

const actions = d(layout.row, layout.end, layout.wrap, gap[2]);

const log = d(layout.column, gap[3], layout.grow, scrolls, {
  minHeight: "240px",
  maxHeight: "50vh",
});

const message = d(layout.column, gap[1], rounded.md, bg.muted, {
  padding: space.x2,
  "& pre": {
    margin: "0",
    whiteSpace: "pre-wrap",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
  },
});

const role = d(type.xs, type.strong);

const headerRow = d(layout.row, layout.between);

/** The Mermaid documentation pages the description's tags link to. */
const SYNTAX_PAGES: Record<string, string> = {
  flowchartLink: "flowchart",
  sequenceLink: "sequenceDiagram",
  classLink: "classDiagram",
  stateLink: "stateDiagram",
  erdLink: "entityRelationshipDiagram",
  ganttLink: "gantt",
  quadrantLink: "quadrantChart",
  timelineLink: "timeline",
};

/** A translation with `<tag>text</tag>` spans, each a link to Mermaid's syntax page for it. */
const withSyntaxLinks = (text: string): Child[] => {
  const parts: Child[] = [];
  const pattern = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(last, match.index));
    const page = SYNTAX_PAGES[match[1] ?? ""];
    parts.push(
      page ? (
        <a href={`https://mermaid.js.org/syntax/${page}.html`} target="_blank" rel="noreferrer">
          {match[2]}
        </a>
      ) : (
        match[2]
      ),
    );
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts;
};

const STORAGE_KEY = EDITOR_LS_KEYS.MERMAID_TO_EXCALIDRAW;

const MERMAID_EXAMPLE =
  "flowchart TD\n A[Christmas] -->|Get money| B(Go shopping)\n B --> C{Let me think}\n C -->|One| D[Laptop]\n C -->|Two| E[iPhone]\n C -->|Three| F[Car]";

const readSavedDefinition = (): string | null => {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as string) : null;
  } catch {
    return null;
  }
};

const saveDefinition = (definition: string): void => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(definition));
  } catch {
    // storage may be full or refused; the definition is only a convenience
  }
};

interface Converted {
  elements: readonly NonDeletedExcalidrawElement[];
  files: BinaryFiles;
}

/**
 * A Mermaid definition as elements, through the optional
 * `@excalidraw/mermaid-to-excalidraw`; a definition with double quotes is
 * tried again with single ones, as Excalidraw does, and the first error is
 * the one reported.
 */
const convertMermaid = async (definition: string): Promise<Converted> => {
  const { mermaidToExcalidraw } = await import("../mermaid.ts");
  try {
    return await mermaidToExcalidraw(definition, MERMAID_TO_EXCALIDRAW_CONFIG);
  } catch (error) {
    if (!definition.includes('"')) throw error;
    try {
      return await mermaidToExcalidraw(definition.replace(/"/g, "'"), MERMAID_TO_EXCALIDRAW_CONFIG);
    } catch {
      throw error;
    }
  }
};

const insertConverted = (ui: DiagramUI, converted: Converted): void => {
  const editor = ui.store.editor;
  if (!editor || converted.elements.length === 0) return;
  editor.batch(() => {
    editor.addElementsFromPasteOrLibrary({
      elements: converted.elements,
      files: converted.files,
      position: "center",
    });
    editor.scrollToContent(editor.scene.getSelectedElements(editor.state), { fit: "scale-down" });
    editor.setState({ openDialog: null });
  });
  editor.focusContainer();
};

/** Draws converted elements into a box, the latest drawing winning. */
const drawPreview = (
  box: HTMLElement,
  converted: Converted,
  theme: "light" | "dark",
  isCurrent: () => boolean,
): void => {
  const { width, height } = box.getBoundingClientRect();
  void exportScene({
    type: "canvas",
    data: { elements: converted.elements, files: converted.files },
    config: {
      padding: DEFAULT_EXPORT_PADDING,
      maxWidthOrHeight: Math.max(width, height, 300) * (globalThis.devicePixelRatio || 1),
      theme,
    },
  }).then(
    (canvas) => {
      if (!isCurrent()) return;
      canvas.setAttribute("aria-hidden", "true");
      box.replaceChildren(canvas);
    },
    (error: unknown) => console.error("DiagramEditor: the Mermaid preview did not draw", error),
  );
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "";

const RENDER_DELAY = 300;
const AUTO_FIX_DELAY = 500;
const AUTO_FIX_MAX_DEPTH = 4;
const AUTO_FIX_MAX_CANDIDATES = 30;

/**
 * The first candidate Mermaid can read, searching the fixes of each fix a
 * few levels deep, as Excalidraw's auto-fix does; `null` when none parses.
 */
const findAutoFix = async (
  source: string,
  error: string,
  cancelled: () => boolean,
): Promise<string | null> => {
  const seen = new Set([source]);
  const queue = getMermaidAutoFixCandidates(source, error).map((text) => ({ text, depth: 1 }));
  let tried = 0;
  while (queue.length > 0 && tried < AUTO_FIX_MAX_CANDIDATES && !cancelled()) {
    const current = queue.shift();
    if (!current || seen.has(current.text)) continue;
    seen.add(current.text);
    tried += 1;
    try {
      await convertMermaid(current.text);
      return current.text;
    } catch (candidateError) {
      const next = errorMessage(candidateError);
      if (current.depth >= AUTO_FIX_MAX_DEPTH || !next) continue;
      for (const text of getMermaidAutoFixCandidates(current.text, next)) {
        if (!seen.has(text)) queue.push({ text, depth: current.depth + 1 });
      }
    }
  }
  return null;
};

/** The Mermaid tab: a definition, its preview as it is typed, and Insert (or Ctrl+Enter). */
function MermaidTab(props: { initial?: string }) {
  const ui = useDiagramUI();
  const t = ui.t;
  const [text, setText] = createSignal(props.initial ?? readSavedDefinition() ?? MERMAID_EXAMPLE);
  const [error, setError] = createSignal<string | null>(null);
  const [found, setAutoFix] = createSignal<{ source: string; fix: string | null } | null>(null);
  // a fix found for the text as it was, while it still is
  const autoFix = (): string | null => {
    const result = found();
    return result && result.source === text() && error() !== null ? result.fix : null;
  };
  const [box, setBox] = createSignal<HTMLDivElement | null>(null);
  let converted: Converted | null = null;
  let request = 0;

  createEffect(
    () => ({ source: text(), target: box(), theme: ui.store.state("theme") }),
    ({ source, target, theme }) => {
      const id = ++request;
      const timer = setTimeout(() => {
        if (!target) return;
        if (!source.trim()) {
          converted = null;
          target.replaceChildren();
          setError(null);
          return;
        }
        convertMermaid(source).then(
          (result) => {
            if (id !== request) return;
            converted = result;
            setError(null);
            drawPreview(target, result, theme, () => id === request);
          },
          (failure: unknown) => {
            if (id !== request) return;
            converted = null;
            setError(errorMessage(failure) || t("chat.errors.mermaidParseError"));
          },
        );
        saveDefinition(source);
      }, RENDER_DELAY);
      return () => clearTimeout(timer);
    },
  );

  createEffect(
    () => ({ source: text(), failure: error() }),
    ({ source, failure }) => {
      let cancelled = false;
      const timer =
        failure && isMermaidAutoFixableError(failure) && source.trim()
          ? setTimeout(() => {
              void findAutoFix(source, failure, () => cancelled).then((fix) => {
                if (!cancelled) setAutoFix({ source, fix });
              });
            }, AUTO_FIX_DELAY)
          : null;
      return () => {
        cancelled = true;
        if (timer !== null) clearTimeout(timer);
      };
    },
  );

  const errorLine = createMemo(() => {
    const failure = error();
    return failure ? getMermaidErrorLineNumber(failure, text()) : null;
  });

  const insert = (): void => {
    if (!converted) return;
    saveDefinition(text());
    insertConverted(ui, converted);
  };

  return (
    <div class={panel}>
      <p class={muted}>{withSyntaxLinks(t("mermaid.description"))}</p>
      <div class={panels}>
        <div class={panel}>
          <Textarea
            class={editorArea}
            aria-label={t("mermaid.syntax")}
            placeholder={t("mermaid.inputPlaceholder")}
            value={text()}
            spellCheck={false}
            onInput={(event: Event) => setText((event.currentTarget as HTMLTextAreaElement).value)}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key === KEYS.ENTER && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                insert();
              }
            }}
            data-testid="mermaid-input"
          />
        </div>
        <div class={panel}>
          <span class={muted}>{t("mermaid.preview")}</span>
          <div
            class={previewBox}
            ref={(element: HTMLDivElement) => queueMicrotask(() => setBox(element))}
            data-testid="mermaid-preview"
          />
          <Show when={error()}>
            {(failure: () => string) => (
              <p class={errorText} role="alert" data-testid="mermaid-error">
                <Show when={errorLine()}>{(line: () => number) => `${line()}: `}</Show>
                {formatMermaidParseErrorMessage(failure())}
              </p>
            )}
          </Show>
          <div class={actions}>
            <Show when={autoFix()}>
              {(fix: () => string) => (
                <Button
                  variant="outline"
                  onPress={() => setText(fix())}
                  data-testid="mermaid-auto-fix"
                >
                  {t("mermaid.autoFixAvailable")}
                </Button>
              )}
            </Show>
            <Button onPress={insert} isDisabled={error() !== null} data-testid="mermaid-insert">
              {t("mermaid.button")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STRINGS = (ui: DiagramUI) => ({
  promptTooShort: (min: number) => ui.t("chat.errors.promptTooShort", { min }),
  promptTooLong: (max: number) => ui.t("chat.errors.promptTooLong", { max }),
  requestFailed: ui.t("chat.errors.requestFailed"),
  generationFailed: ui.t("chat.errors.generationFailed"),
  mermaidParseError: ui.t("chat.errors.mermaidParseError"),
});

/**
 * The text-to-diagram tab: a chat with the app's backend, which answers in
 * Mermaid, streamed into the reply; the last reply previews beside it and
 * any reply inserts. A reply Mermaid cannot read can be repaired by the
 * backend or edited in the Mermaid tab.
 */
function TextToDiagramTab(props: {
  options: TextToDiagramOptions;
  onViewAsMermaid: (definition: string) => void;
}) {
  const ui = useDiagramUI();
  const t = ui.t;
  const [version, setVersion] = createSignal(0);
  const session = new TextToDiagramSession(
    untrack(() => props.options),
    async (definition) => {
      await convertMermaid(definition);
    },
    STRINGS(ui),
    () => setVersion((value) => value + 1),
  );
  void session.loadChats();
  onCleanup(() => session.dispose());

  const history = () => {
    version();
    return session.history;
  };
  const last = () => getLastAssistantMessage(history());
  const generating = () => last()?.isGenerating === true;
  const failure = () => {
    version();
    return session.error;
  };
  const rateLimits = () => {
    version();
    return session.rateLimits;
  };
  const saved = () => {
    version();
    return session.savedChats;
  };

  const [box, setBox] = createSignal<HTMLDivElement | null>(null);
  let preview: Converted | null = null;
  let request = 0;
  createEffect(
    () => {
      const reply = last();
      return {
        definition: reply && !reply.isGenerating && !reply.error ? (reply.content ?? "") : "",
        target: box(),
        theme: ui.store.state("theme"),
      };
    },
    ({ definition, target, theme }) => {
      const id = ++request;
      if (!target) return;
      if (!definition.trim()) {
        preview = null;
        target.replaceChildren();
        return;
      }
      convertMermaid(definition).then(
        (result) => {
          if (id !== request) return;
          preview = result;
          drawPreview(target, result, theme, () => id === request);
        },
        () => {
          if (id === request) preview = null;
        },
      );
    },
  );

  const insertMessage = (chat: ChatMessage): void => {
    const definition = chat.content ?? "";
    if (!definition.trim()) return;
    convertMermaid(definition).then(
      (result) => insertConverted(ui, result),
      (error: unknown) => console.error("DiagramEditor: the reply did not convert", error),
    );
  };

  const submit = (): void => {
    const prompt = session.history.currentPrompt;
    if (!prompt.trim() || session.isGenerating) return;
    void session.generate(prompt);
  };

  const warning = (chat: ChatMessage): string =>
    chat.warningType === "messageLimitExceeded"
      ? t("chat.rateLimit.messageLimit")
      : t("chat.rateLimit.generalRateLimit");

  return (
    <div class={panels} data-testid="ttd-chat">
      <div class={panel}>
        <div class={headerRow}>
          <span class={role}>{t("chat.label")}</span>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                size="icon"
                class={iconButton}
                aria-label={t("chat.menu")}
                title={t("chat.menu")}
                data-testid="ttd-chat-menu"
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent class={menuSurface} aria-label={t("chat.menu")}>
              <DropdownMenuItem
                class={menuItem}
                onAction={() => void session.newChat()}
                data-testid="ttd-new-chat"
              >
                {t("chat.newChat")}
              </DropdownMenuItem>
              <Show when={saved().length > 0}>
                <DropdownMenuSeparator />
              </Show>
              <For each={saved()}>
                {(chat: (typeof session.savedChats)[number]) => (
                  <DropdownMenuItem
                    class={menuItem}
                    onAction={() => session.restoreChat(chat)}
                    data-selected={chat.id === history().id ? "" : undefined}
                  >
                    {chat.title}
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div class={log} role="log" aria-live="polite" aria-label={t("chat.label")}>
          <Show when={history().messages.length === 0}>
            <div data-testid="ttd-welcome">
              {props.options.renderWelcomeScreen?.({ rateLimits: rateLimits() ?? null }) ?? (
                <TTDWelcomeMessage />
              )}
            </div>
          </Show>
          <For each={history().messages} keyed={(chat: ChatMessage) => chat.id}>
            {(chat: () => ChatMessage) => (
              <div class={message} data-testid={`ttd-message-${chat().type}`}>
                <Show when={chat().type !== "warning"}>
                  <span class={role}>
                    {chat().type === "user" ? t("chat.role.user") : t("chat.role.assistant")}
                  </span>
                </Show>
                <Show when={chat().type === "user"}>
                  <span>{chat().content}</span>
                </Show>
                <Show when={chat().type === "warning"}>
                  <span role="alert">
                    {props.options.renderWarning?.(chat()) ?? warning(chat())}
                  </span>
                </Show>
                <Show when={chat().type === "assistant"}>
                  <Show when={chat().content}>
                    <pre>{chat().content}</pre>
                  </Show>
                  <Show when={chat().isGenerating}>
                    <span class={muted}>{t("chat.generating")}</span>
                  </Show>
                  <Show when={chat().error}>
                    <p class={errorText} role="alert">
                      {chat().errorType === "parse"
                        ? t("chat.errors.invalidDiagram")
                        : chat().error}
                    </p>
                    <div class={actions}>
                      <Show
                        when={chat().errorType === "parse"}
                        fallback={
                          <Button variant="outline" onPress={() => void session.retry(chat())}>
                            {t("chat.retry")}
                          </Button>
                        }
                      >
                        <Button
                          variant="outline"
                          onPress={() => props.onViewAsMermaid(chat().content ?? "")}
                        >
                          {t("chat.errors.fixInMermaid")}
                        </Button>
                        <Button
                          variant="outline"
                          onPress={() => void session.repair(chat())}
                          data-testid="ttd-repair"
                        >
                          {t("chat.errors.aiRepair")}
                        </Button>
                      </Show>
                    </div>
                  </Show>
                  <Show when={!chat().isGenerating && !chat().error && chat().content}>
                    <div class={actions}>
                      <Button
                        variant="ghost"
                        size="icon"
                        class={iconButton}
                        aria-label={t("chat.deleteMessage")}
                        title={t("chat.deleteMessage")}
                        onPress={() => session.deleteMessage(chat().id)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                      <Button
                        variant="outline"
                        onPress={() => props.onViewAsMermaid(chat().content ?? "")}
                      >
                        {t("chat.viewAsMermaid")}
                      </Button>
                      <Button
                        onPress={() => insertMessage(chat())}
                        data-testid="ttd-insert-message"
                      >
                        {t("chat.insert")}
                      </Button>
                    </div>
                  </Show>
                </Show>
              </div>
            )}
          </For>
        </div>
        <Show when={failure() && !last()?.error}>
          <p class={errorText} role="alert">
            {failure()?.message}
          </p>
        </Show>
        <Textarea
          aria-label={t("labels.textToDiagram")}
          placeholder={
            rateLimits()?.rateLimitRemaining === 0
              ? t("chat.rateLimit.messageLimitInputPlaceholder")
              : history().messages.length > 0
                ? t("chat.inputPlaceholderWithMessages")
                : t("chat.inputPlaceholder", { shortcut: getShortcutKey("Shift+Enter", t) })
          }
          value={history().currentPrompt}
          disabled={rateLimits()?.rateLimitRemaining === 0}
          onInput={(event: Event) =>
            session.setPrompt((event.currentTarget as HTMLTextAreaElement).value)
          }
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === KEYS.ENTER && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          data-testid="ttd-input"
        />
        <div class={actions}>
          <Show when={rateLimits()}>
            {(limits: () => { rateLimitRemaining: number }) => (
              <span class={muted}>
                {t("chat.rateLimitRemaining", { count: limits().rateLimitRemaining })}
              </span>
            )}
          </Show>
          <Show
            when={generating()}
            fallback={
              <Button onPress={submit} data-testid="ttd-send">
                {t("chat.send")}
              </Button>
            }
          >
            <Button variant="outline" onPress={() => session.abort()} data-testid="ttd-stop">
              {t("chat.stop")}
            </Button>
          </Show>
        </div>
      </div>
      <div class={panel}>
        <span class={muted}>{t("chat.preview")}</span>
        <div
          class={previewBox}
          ref={(element: HTMLDivElement) => queueMicrotask(() => setBox(element))}
          data-testid="ttd-preview"
        />
        <div class={actions}>
          <Button
            onPress={() => {
              if (preview) insertConverted(ui, preview);
            }}
            isDisabled={generating() || !last()?.content || Boolean(last()?.error)}
            data-testid="ttd-insert"
          >
            {t("chat.insert")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Excalidraw's `TTDDialog`, given to `<DiagramEditor>` as a child: the app's
 * text-to-diagram backend (`onTextSubmit`, `persistenceAdapter`,
 * `renderWelcomeScreen`, `renderWarning`), which the dialog's chat talks to.
 * Without it the dialog has the Mermaid tab alone.
 */
function TTDDialogRoot(props: TextToDiagramOptions): JSX.Element {
  if (isHostChild()) {
    return hostSlot("ttdDialog", {
      get onTextSubmit() {
        return props.onTextSubmit;
      },
      get persistenceAdapter() {
        return props.persistenceAdapter;
      },
      get renderWelcomeScreen() {
        return props.renderWelcomeScreen;
      },
      get renderWarning() {
        return props.renderWarning;
      },
    });
  }
  return <TTDDialogBase />;
}

export const TTDDialog = Object.assign(TTDDialogRoot, {
  /** The chat's default greeting, for a `renderWelcomeScreen` that adds to it. */
  WelcomeMessage: TTDWelcomeMessage,
});

/**
 * Excalidraw's `TTDDialogTrigger`, given to `<DiagramEditor>` as a child: the
 * extra tools' entry that opens the text-to-diagram dialog, with its label
 * (`children`) and icon.
 */
export function TTDDialogTrigger(props: { children?: Child; icon?: Child }): JSX.Element {
  return isHostChild()
    ? hostSlot("ttdDialogTrigger", {
        get children() {
          return readProp(props.children) as Child;
        },
        get icon() {
          return readProp(props.icon) as Child;
        },
      })
    : null;
}

function TTDWelcomeMessage() {
  const ui = useDiagramUI();
  const t = ui.t;
  return (
    <>
      <p style="margin:0 0 4px;font-weight:600">{t("chat.placeholder.title")}</p>
      <p class={muted}>{t("chat.placeholder.description")}</p>
      <p class={muted}>{t("chat.placeholder.hint")}</p>
    </>
  );
}

/**
 * The text-to-diagram dialog (`openDialog: ttd`): the Mermaid tab, and, when
 * `aiEnabled` and the app gives a backend, the text-to-diagram chat beside it.
 */
export function TTDDialogBase() {
  const ui = useDiagramUI();
  const t = ui.t;
  const store = ui.store;
  const dialog = () => {
    const open = store.state("openDialog");
    return open?.name === "ttd" ? open : null;
  };
  const backend = () => (ui.host().aiEnabled ? (ui.host().textToDiagram ?? null) : null);
  const tab = () =>
    dialog()?.tab === "text-to-diagram" && backend() ? "text-to-diagram" : "mermaid";
  const [handedOver, setHandedOver] = createSignal<string | undefined>(undefined);

  const setTab = (next: "text-to-diagram" | "mermaid"): void => {
    const editor = store.editor;
    editor?.batch(() => editor.setState({ openDialog: { name: "ttd", tab: next } }));
  };

  const close = (): void => {
    const editor = store.editor;
    if (editor?.state.openDialog?.name === "ttd") {
      editor.batch(() => editor.setState({ openDialog: null }));
      editor.focusContainer();
    }
  };

  const viewAsMermaid = (definition: string): void => {
    saveDefinition(definition);
    setHandedOver(definition);
    setTab("mermaid");
  };

  return (
    <Dialog
      isOpen={dialog() !== null}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) close();
      }}
    >
      <DialogContent class={content} closeLabel={t("buttons.close")} data-testid="ttd-dialog">
        <DialogHeader>
          <DialogTitle>{backend() ? t("labels.textToDiagram") : t("mermaid.title")}</DialogTitle>
        </DialogHeader>
        <Show when={backend()} fallback={<MermaidTab />}>
          {(options: () => TextToDiagramOptions) => (
            <Tabs
              value={tab()}
              onValueChange={(next: string) => setTab(next as "text-to-diagram" | "mermaid")}
            >
              <TabsList aria-label={t("labels.textToDiagram")}>
                <TabsTrigger value="text-to-diagram">
                  {t("labels.textToDiagram")} · {t("chat.aiBeta")}
                </TabsTrigger>
                <TabsTrigger value="mermaid">{t("mermaid.label")}</TabsTrigger>
              </TabsList>
              <TabsContent value="text-to-diagram">
                <TextToDiagramTab options={options()} onViewAsMermaid={viewAsMermaid} />
              </TabsContent>
              <TabsContent value="mermaid">
                <MermaidTab initial={handedOver()} />
              </TabsContent>
            </Tabs>
          )}
        </Show>
      </DialogContent>
    </Dialog>
  );
}
