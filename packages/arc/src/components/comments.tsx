import { type Child, For, Show, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { JSX } from "@barqjs/web";
import { filter as localeFilter } from "@barqjs/aria/i18n";
import { Check } from "@barqjs/lucide/icons/check";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { Link2Off } from "@barqjs/lucide/icons/link-2-off";
import { RotateCcw } from "@barqjs/lucide/icons/rotate-ccw";
import { Button } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { srOnly } from "@barqjs/ui/sr-only";
import { Textarea } from "@barqjs/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui/toggle-group";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  control,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  plainList,
  rounded,
  space,
  surface,
  target,
  type,
} from "../style/index.ts";
import type { Person } from "./avatar-stack.tsx";
import { Chip } from "./chip.tsx";
import { confirm } from "./confirm.tsx";
import { EmptyState } from "./empty-state.tsx";
import { type Moment, RelativeTime } from "./format.tsx";
import { IconButton } from "./icon-button.tsx";
import { Indicator } from "./indicator.tsx";
import { useArcMessages } from "./messages.ts";
import { PersonAvatar } from "./person-avatar.tsx";
import { QUICK_REACTIONS, type Reaction, ReactionBar } from "./reactions.tsx";

/** Someone who writes or is mentioned in a comment. */
export interface CommentPerson extends Person {
  id: string;
}

export type CommentReaction = Reaction;

export interface CommentData {
  id: string;
  author: CommentPerson;
  body: string;
  createdAt: Moment;
  editedAt?: Moment;
  /** The people `body` mentions as `@Name`, drawn as mentions. */
  mentions?: readonly CommentPerson[];
  reactions?: readonly CommentReaction[];
  /** Not seen by the reader yet. */
  unread?: boolean;
}

/** What a thread is about: a passage, a block, a field. */
export interface CommentAnchor {
  id?: string;
  /** The text the thread was started on. */
  quote?: string;
  /** Names the anchor where there is no quote: "Step 3", "Header image". */
  label?: string;
  /** What the thread was on has gone or changed past finding. */
  detached?: boolean;
}

export interface CommentThreadData {
  id: string;
  /** The first starts the thread; the rest are its replies. */
  comments: readonly CommentData[];
  resolved?: boolean;
  anchor?: CommentAnchor;
}

/** What a composer hands over: the text and the people it still mentions. */
export interface CommentDraft {
  body: string;
  mentions: CommentPerson[];
}

/** An answer now, or a promise the thread shows as pending until it settles. */
type Outcome = void | Promise<unknown>;

export type Mentionables =
  | readonly CommentPerson[]
  | ((query: string) => readonly CommentPerson[] | Promise<readonly CommentPerson[]>);

/** What every thread in a list shares. */
export interface CommentHandlers {
  /** The reader: their own comments can be edited and deleted. */
  currentUser?: CommentPerson;
  /** Whether the reader may edit and delete a comment. @default their own */
  canModify?: (comment: CommentData) => boolean;
  onReply?: (threadId: string, draft: CommentDraft) => Outcome;
  onEdit?: (comment: CommentData, draft: CommentDraft, threadId: string) => Outcome;
  onDelete?: (comment: CommentData, threadId: string) => Outcome;
  onResolve?: (threadId: string, resolved: boolean) => Outcome;
  onReact?: (comment: CommentData, emoji: string, add: boolean, threadId: string) => Outcome;
  /** Pressing the anchor's quote: scroll to it, select it. */
  onAnchorPress?: (thread: CommentThreadData) => void;
  /** Who `@` offers, as a list or found by what follows the `@`. */
  mentionables?: Mentionables;
  /** The reactions offered. @default 👍 ❤️ 🎉 😄 👀 */
  reactions?: readonly string[];
  /** A comment's body, for rich text; plain text with its mentions marked otherwise. */
  renderBody?: (comment: CommentData) => Child;
  /**
   * What a comment is written in: `CommentComposer`'s text box by default, or
   * `RichCommentComposer` from `@barqjs/arc/editor` for formatting and rich
   * mentions, which the main entry leaves out so a page without it loads no
   * editor.
   */
  composer?: (props: CommentComposerProps) => JSX.Element;
  /** The moment times are measured from on the server and while hydrating. */
  now?: Moment;
}

const quiet = arc({ opacity: "0.6" });

export const commentsStyles = variants({
  slots: {
    root: arc(layout.column, gap[3], layout.minZero),
    filters: arc(layout.row, layout.wrap, gap[2]),
    list: arc(plainList, layout.column, gap[3]),
    thread: arc(surface.card, layout.column, gap[3], { padding: space.x3 }),
    threadHeader: arc(layout.row, gap[2], layout.minZero),
    anchor: arc(layout.minZero, layout.grow, type.meta, layout.clamp2, edge.start, {
      paddingInlineStart: space.x2,
      textAlign: "start",
    }),
    anchorButton: arc(control.bare, focus.visible, rounded.xs, target.size),
    detached: arc(layout.row, gap[1.5], type.meta, glyph.sm, { fontStyle: "italic" }),
    comments: arc(plainList, layout.column, gap[3]),
    comment: arc({}),
    article: arc(layout.row, gap[2], { alignItems: "flex-start" }),
    avatar: arc(layout.noShrink),
    main: arc(layout.column, gap[1], layout.minZero, layout.grow),
    header: arc(layout.row, layout.wrap, gap[1.5]),
    author: arc(type.label),
    meta: arc(type.meta, type.numeric),
    status: arc(type.caption, fg.muted),
    error: arc(type.caption, fg.danger),
    body: arc(type.body, type.written),
    mention: arc(fg.link, type.medium),
    reactions: arc(layout.row, layout.wrap, gap[1]),
    actions: arc(layout.pushEnd, layout.row, gap[1]),
    reply: arc(layout.column, gap[2]),
    replyButton: arc({ alignSelf: "flex-start" }),
    composer: arc(layout.column, gap[2]),
    composerInput: arc({ minBlockSize: space.x16 }),
    composerFooter: arc(layout.row, layout.end, gap[2]),
    suggestions: arc(plainList, surface.elevated, layout.column, { padding: space.x1 }),
    suggestion: arc(
      layout.row,
      gap[2],
      rounded.sm,
      interaction.pressable,
      interaction.selected,
      target.size,
      { padding: space.x1_5 },
    ),
  },
  variants: {
    resolved: { true: { thread: quiet }, false: {} },
    pending: { true: { comment: quiet }, false: {} },
  },
  defaults: { resolved: false, pending: false },
});

type Slots = ReturnType<typeof commentsStyles>;

// --- the composer ----------------------------------------------------------

const TRIGGER = /(?:^|\s)@([^\s@]{0,40})$/u;

export interface CommentComposerProps extends Customisable<Slots> {
  /** Names the text box: "Comment", "Reply to Salama". */
  label: string;
  placeholder?: string;
  /** @default arc's "Comment" */
  submitLabel?: string;
  defaultValue?: string;
  defaultMentions?: readonly CommentPerson[];
  onSubmit: (draft: CommentDraft) => void;
  /** Adds a Cancel button, and Escape cancels. */
  onCancel?: () => void;
  mentionables?: Mentionables;
  autoFocus?: boolean;
  isDisabled?: boolean;
}

/**
 * A text box for a comment: Mod+Enter sends it, and `@` offers the people
 * `mentionables` names, chosen with the arrows and Enter.
 */
export function CommentComposer(props: CommentComposerProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(commentsStyles(), props.classes);
  }
  const listId = createUniqueId();
  const match = localeFilter({ sensitivity: "base" });
  const [text, setText] = createSignal(props.defaultValue ?? "", { ownedWrite: true });
  const [mentioned, setMentioned] = createSignal<readonly CommentPerson[]>(
    props.defaultMentions ?? [],
    { ownedWrite: true },
  );
  const [query, setQuery] = createSignal<string | null>(null);
  const [candidates, setCandidates] = createSignal<readonly CommentPerson[]>([]);
  const [active, setActive] = createSignal(0);
  let input: HTMLTextAreaElement | undefined;
  let asked = 0;

  function open(): boolean {
    return query() !== null && candidates().length > 0;
  }

  function look(): void {
    if (input === undefined || props.mentionables === undefined) return;
    const before = input.value.slice(0, input.selectionStart);
    const found = TRIGGER.exec(before);
    if (found === null) {
      setQuery(null);
      return;
    }
    const typed = found[1] ?? "";
    setQuery(typed);
    setActive(0);
    const source = props.mentionables;
    const turn = ++asked;
    function take(people: readonly CommentPerson[]): void {
      if (turn !== asked) return;
      setCandidates(people.slice(0, 6));
    }
    if (typeof source === "function") {
      const answer = source(typed);
      if ("then" in answer) void answer.then(take, () => take([]));
      else take(answer);
    } else {
      take(source.filter((person) => match.contains(person.name, typed)));
    }
  }

  function insert(person: CommentPerson): void {
    if (input === undefined) return;
    const caret = input.selectionStart;
    const before = input.value.slice(0, caret);
    const found = TRIGGER.exec(before);
    if (found === null) return;
    const start = caret - (found[1] ?? "").length - 1;
    const written = `@${person.name} `;
    const next = input.value.slice(0, start) + written + input.value.slice(caret);
    input.value = next;
    setText(next);
    input.setSelectionRange(start + written.length, start + written.length);
    if (!mentioned().some((one) => one.id === person.id)) setMentioned([...mentioned(), person]);
    setQuery(null);
  }

  function submit(): void {
    const body = text().trim();
    if (body === "" || props.isDisabled === true) return;
    const mentions = mentioned().filter((person) => body.includes(`@${person.name}`));
    props.onSubmit({ body, mentions });
    setText("");
    setMentioned([]);
    if (input !== undefined) input.value = "";
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (open()) {
      const count = candidates().length;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((active() + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const person = candidates()[active()];
        if (person !== undefined) insert(person);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Escape" && props.onCancel !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      props.onCancel();
    }
  }

  function optionId(index: number): string {
    return `${listId}-${String(index)}`;
  }

  return (
    <div class={arc(cls().composer, props.class, props.className)} data-slot="comment-composer">
      <Textarea
        ref={(element: HTMLTextAreaElement) => {
          input = element;
        }}
        class={cls().composerInput}
        data-slot="comment-composer-input"
        aria-label={props.label}
        placeholder={props.placeholder}
        value={text()}
        autoFocus={props.autoFocus}
        disabled={props.isDisabled}
        aria-autocomplete={props.mentionables === undefined ? undefined : "list"}
        aria-controls={open() ? listId : undefined}
        aria-activedescendant={open() ? optionId(active()) : undefined}
        onInput={(event: Event) => {
          setText((event.currentTarget as HTMLTextAreaElement).value);
          look();
        }}
        onKeyDown={onKeyDown}
        onClick={look}
      />
      <Show when={open()}>
        <ul
          id={listId}
          role="listbox"
          aria-label={messages().mentionSuggestions}
          class={cls().suggestions}
          data-slot="comment-mentions"
        >
          <For each={candidates()}>
            {(person: CommentPerson, index: () => number) => (
              <li
                id={optionId(index())}
                role="option"
                aria-selected={active() === index()}
                data-selected={active() === index() ? "" : undefined}
                class={cls().suggestion}
                data-slot="comment-mention-option"
                onMouseDown={(event: MouseEvent) => event.preventDefault()}
                onClick={() => insert(person)}
              >
                <PersonAvatar person={person} size="sm" />
                <span>{person.name}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <div class={cls().composerFooter} data-slot="comment-composer-footer">
        <Show when={props.onCancel !== undefined}>
          <Button variant="ghost" size="sm" onPress={() => props.onCancel?.()}>
            {messages().cancel}
          </Button>
        </Show>
        <Button
          size="sm"
          data-slot="comment-composer-submit"
          isDisabled={props.isDisabled === true || text().trim() === ""}
          onPress={submit}
        >
          {props.submitLabel ?? messages().comment}
        </Button>
      </div>
    </div>
  );
}

// --- one comment -------------------------------------------------------------

interface Piece {
  text: string;
  person?: CommentPerson;
}

/** The body cut at each `@Name` of the people it mentions. */
function bodyPieces(body: string, mentions: readonly CommentPerson[]): Piece[] {
  const names = mentions
    .map((person) => ({ person, token: `@${person.name}` }))
    .toSorted((a, b) => b.token.length - a.token.length);
  const out: Piece[] = [];
  let plain = "";
  let at = 0;
  while (at < body.length) {
    const hit = names.find((one) => body.startsWith(one.token, at));
    if (hit === undefined) {
      plain += body[at] ?? "";
      at++;
      continue;
    }
    if (plain !== "") out.push({ text: plain });
    plain = "";
    out.push({ text: hit.token, person: hit.person });
    at += hit.token.length;
  }
  if (plain !== "") out.push({ text: plain });
  return out;
}

interface CommentItemProps {
  comment: CommentData;
  threadId: string;
  handlers: CommentHandlers;
  classes: Slots;
  /** Sending, or a change to it is on its way. */
  pending?: boolean;
  /** Why the last change to it failed. */
  error?: string;
  onEdit: (draft: CommentDraft) => void;
  onDelete: () => void;
  onReact: (emoji: string, add: boolean) => void;
  /** For a reply that failed to send. */
  onRetry?: () => void;
  onDiscard?: () => void;
}

function CommentItem(props: CommentItemProps) {
  const Composer = props.handlers.composer ?? CommentComposer;
  const messages = useArcMessages();
  const nameId = createUniqueId();
  const [editing, setEditing] = createSignal(false);
  function comment(): CommentData {
    return props.comment;
  }
  function own(): boolean {
    return (
      props.handlers.canModify?.(comment()) ??
      (props.handlers.currentUser !== undefined &&
        props.handlers.currentUser.id === comment().author.id)
    );
  }
  function canEdit(): boolean {
    return own() && props.handlers.onEdit !== undefined && props.onRetry === undefined;
  }
  function canDelete(): boolean {
    return own() && props.handlers.onDelete !== undefined && props.onRetry === undefined;
  }
  function reactions(): readonly string[] {
    return props.handlers.reactions ?? QUICK_REACTIONS;
  }
  function cls(): Slots {
    return props.classes;
  }
  function pendingCls(): string {
    return commentsStyles({ pending: props.pending === true }).comment;
  }

  return (
    <li
      class={arc(pendingCls(), cls().comment)}
      data-slot="comment"
      data-unread={comment().unread === true ? "" : undefined}
      data-pending={props.pending === true ? "" : undefined}
      aria-busy={props.pending === true ? "true" : undefined}
    >
      <article aria-labelledby={nameId} class={cls().article} data-slot="comment-article">
        <PersonAvatar person={comment().author} size="sm" class={cls().avatar} />
        <div class={cls().main} data-slot="comment-main">
          <div class={cls().header} data-slot="comment-header">
            <span id={nameId} class={cls().author} data-slot="comment-author">
              {comment().author.name}
            </span>
            <span class={cls().meta} data-slot="comment-time">
              <RelativeTime value={comment().createdAt} now={props.handlers.now} />
            </span>
            <Show when={comment().editedAt !== undefined}>
              <span class={cls().meta} data-slot="comment-edited">
                {messages().edited}
              </span>
            </Show>
            <Show when={comment().unread === true}>
              <Indicator dot tone="info" size="sm" label={messages().newItem} />
              <span class={srOnly}>{messages().newItem}</span>
            </Show>
            <Show when={props.pending === true && props.onRetry === undefined}>
              <span class={cls().status} data-slot="comment-status" role="status">
                {messages().sending}
              </span>
            </Show>
            <Show when={canEdit() || canDelete()}>
              <div class={cls().actions} data-slot="comment-actions">
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <IconButton
                      label={messages().commentActions(comment().author.name)}
                      variant="ghost"
                      size="sm"
                      tooltip={false}
                    >
                      <Ellipsis aria-hidden="true" />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    aria-label={messages().commentActions(comment().author.name)}
                  >
                    <Show when={canEdit()}>
                      <DropdownMenuItem id="edit" onAction={() => setEditing(true)}>
                        {messages().edit}
                      </DropdownMenuItem>
                    </Show>
                    <Show when={canDelete()}>
                      <DropdownMenuItem
                        id="delete"
                        variant="destructive"
                        onAction={() => props.onDelete()}
                      >
                        {messages().delete}
                      </DropdownMenuItem>
                    </Show>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Show>
          </div>
          <Show
            when={editing()}
            fallback={
              <div class={cls().body} data-slot="comment-body">
                {props.handlers.renderBody?.(comment()) ?? (
                  <For each={bodyPieces(comment().body, comment().mentions ?? [])}>
                    {(piece: Piece) =>
                      piece.person === undefined ? (
                        piece.text
                      ) : (
                        <span class={cls().mention} data-slot="comment-mention">
                          {piece.text}
                        </span>
                      )
                    }
                  </For>
                )}
              </div>
            }
          >
            <Composer
              label={messages().editComment}
              submitLabel={messages().save}
              defaultValue={comment().body}
              defaultMentions={comment().mentions}
              mentionables={props.handlers.mentionables}
              classes={cls()}
              autoFocus
              onCancel={() => setEditing(false)}
              onSubmit={(draft) => {
                setEditing(false);
                props.onEdit(draft);
              }}
            />
          </Show>
          <Show when={props.error !== undefined}>
            <span class={cls().error} role="alert" data-slot="comment-error">
              {props.error}
            </span>
          </Show>
          <Show when={props.onRetry !== undefined}>
            <div class={cls().reactions}>
              <Button variant="outline" size="xs" onPress={() => props.onRetry?.()}>
                {messages().retry}
              </Button>
              <Button variant="ghost" size="xs" onPress={() => props.onDiscard?.()}>
                {messages().discard}
              </Button>
            </div>
          </Show>
          <Show
            when={
              props.onRetry === undefined &&
              ((comment().reactions?.length ?? 0) > 0 || props.handlers.onReact !== undefined)
            }
          >
            <ReactionBar
              class={cls().reactions}
              slot="comment-reactions"
              reactions={comment().reactions ?? []}
              quick={reactions()}
              onReact={
                props.handlers.onReact === undefined
                  ? undefined
                  : (emoji: string, add: boolean) => props.onReact(emoji, add)
              }
            />
          </Show>
        </div>
      </article>
    </li>
  );
}

// --- a thread ------------------------------------------------------------------

interface PendingReply {
  key: string;
  draft: CommentDraft;
  createdAt: Date;
  failed: boolean;
}

export interface CommentThreadProps extends CommentHandlers, Customisable<Slots> {
  thread: CommentThreadData;
}

/** Apply `change` at once, and take it back when `outcome` fails. */
function optimistic(outcome: Outcome, settle: (failed: boolean) => void): void {
  if (outcome instanceof Promise) {
    outcome.then(
      () => settle(false),
      () => settle(true),
    );
  } else {
    settle(false);
  }
}

/**
 * One conversation: the comment that started it, its replies, and what it is
 * about. Replies, edits, deletes, reactions and resolving show at once and
 * stay pending until the caller's promise settles; a reply that fails stays,
 * marked, with Retry and Discard.
 */
export function CommentThread(props: CommentThreadProps) {
  const Composer = props.composer ?? CommentComposer;
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(commentsStyles({ resolved: resolved() }), props.classes);
  }
  const headingId = createUniqueId();
  const [replies, setReplies] = createSignal<readonly PendingReply[]>([]);
  const [replying, setReplying] = createSignal(false);
  const [resolvedNow, setResolvedNow] = createSignal<boolean | undefined>(undefined);
  const [edits, setEdits] = createSignal<Readonly<Record<string, CommentDraft>>>({});
  const [deleting, setDeleting] = createSignal<ReadonlySet<string>>(new Set());
  const [reacting, setReacting] = createSignal<Readonly<Record<string, boolean>>>({});
  const [errors, setErrors] = createSignal<Readonly<Record<string, string>>>({});
  let made = 0;

  function resolved(): boolean {
    return resolvedNow() ?? props.thread.resolved === true;
  }
  function id(): string {
    return props.thread.id;
  }

  function withEntry<V>(record: Readonly<Record<string, V>>, key: string, value?: V) {
    const next = { ...record };
    if (value === undefined) delete next[key];
    else next[key] = value;
    return next;
  }

  function shown(): CommentData[] {
    return props.thread.comments
      .filter((comment) => !deleting().has(comment.id))
      .map((comment) => {
        const edited = edits()[comment.id];
        let reactions = comment.reactions;
        for (const [key, add] of Object.entries(reacting())) {
          const [commentId, emoji] = key.split("\u0000") as [string, string];
          if (commentId !== comment.id) continue;
          const list = [...(reactions ?? [])];
          const at = list.findIndex((one) => one.emoji === emoji);
          const held = list[at];
          if (held === undefined) {
            if (add) list.push({ emoji, count: 1, reacted: true });
          } else {
            const count = held.count + (add ? 1 : -1);
            if (count <= 0) list.splice(at, 1);
            else list[at] = { ...held, count, reacted: add };
          }
          reactions = list;
        }
        return edited === undefined
          ? { ...comment, reactions }
          : { ...comment, reactions, body: edited.body, mentions: edited.mentions };
      });
  }

  function fail(key: string, message: string): void {
    setErrors(withEntry(errors(), key, message));
  }
  function clear(key: string): void {
    setErrors(withEntry(errors(), key));
  }

  function send(pending: PendingReply): void {
    const outcome = props.onReply?.(id(), pending.draft);
    optimistic(outcome, (failed) => {
      setReplies(
        failed
          ? replies().map((one) => (one.key === pending.key ? { ...one, failed: true } : one))
          : replies().filter((one) => one.key !== pending.key),
      );
    });
  }

  function reply(draft: CommentDraft): void {
    const pending: PendingReply = {
      key: `pending-${String(++made)}`,
      draft,
      createdAt: new Date(),
      failed: false,
    };
    setReplies([...replies(), pending]);
    send(pending);
  }

  function edit(comment: CommentData, draft: CommentDraft): void {
    clear(comment.id);
    setEdits(withEntry(edits(), comment.id, draft));
    optimistic(props.onEdit?.(comment, draft, id()), (failed) => {
      setEdits(withEntry(edits(), comment.id));
      if (failed) fail(comment.id, messages().editFailed);
    });
  }

  async function remove(comment: CommentData): Promise<void> {
    const sure = await confirm({
      title: messages().deleteCommentHeading,
      description: messages().deleteCommentDescription,
      confirmLabel: messages().delete,
      tone: "danger",
    });
    if (!sure) return;
    clear(comment.id);
    setDeleting(new Set([...deleting(), comment.id]));
    optimistic(props.onDelete?.(comment, id()), (failed) => {
      const next = new Set(deleting());
      next.delete(comment.id);
      setDeleting(next);
      if (failed) fail(comment.id, messages().deleteFailed);
    });
  }

  function react(comment: CommentData, emoji: string, add: boolean): void {
    const key = `${comment.id}\u0000${emoji}`;
    setReacting(withEntry(reacting(), key, add));
    optimistic(props.onReact?.(comment, emoji, add, id()), () => {
      setReacting(withEntry(reacting(), key));
    });
  }

  function toggleResolved(): void {
    const next = !resolved();
    setResolvedNow(next);
    optimistic(props.onResolve?.(id(), next), () => setResolvedNow(undefined));
  }

  function unread(): number {
    return props.thread.comments.filter((one) => one.unread === true).length;
  }
  function anchor(): CommentAnchor | undefined {
    return props.thread.anchor;
  }
  function anchorText(): string {
    return anchor()?.quote ?? anchor()?.label ?? "";
  }
  function pendingAuthor(): CommentPerson {
    return props.currentUser ?? { id: "", name: messages().you };
  }

  return (
    <article
      class={arc(cls().thread, props.class, props.className)}
      data-slot="comment-thread"
      data-resolved={resolved() ? "" : undefined}
      aria-labelledby={headingId}
    >
      <div class={cls().threadHeader} data-slot="comment-thread-header">
        <h3 id={headingId} class={srOnly}>
          {anchorText() === ""
            ? messages().threadBy(props.thread.comments[0]?.author.name ?? "")
            : messages().threadOn(anchorText())}
        </h3>
        <Show when={anchor() !== undefined}>
          <Show
            when={anchor()?.detached !== true}
            fallback={
              <span class={cls().detached} data-slot="comment-thread-detached">
                <Link2Off aria-hidden="true" />
                {messages().detachedAnchor}
              </span>
            }
          >
            <Show
              when={props.onAnchorPress !== undefined}
              fallback={
                <blockquote
                  class={arc(layout.flush, cls().anchor)}
                  data-slot="comment-thread-anchor"
                >
                  {anchorText()}
                </blockquote>
              }
            >
              <button
                type="button"
                class={arc(cls().anchorButton, cls().anchor)}
                data-slot="comment-thread-anchor"
                aria-label={messages().showAnchor(anchorText())}
                onClick={() => props.onAnchorPress?.(props.thread)}
              >
                {anchorText()}
              </button>
            </Show>
          </Show>
        </Show>
        <Show when={unread() > 0}>
          <Indicator
            count={unread()}
            tone="info"
            size="sm"
            label={messages().newCount(String(unread()))}
          />
        </Show>
        <Show when={props.onResolve !== undefined}>
          <div class={cls().actions}>
            <IconButton
              label={resolved() ? messages().reopen : messages().resolve}
              variant="ghost"
              size="sm"
              isPressed={resolved()}
              onPress={toggleResolved}
            >
              {resolved() ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
            </IconButton>
          </div>
        </Show>
      </div>
      <Show when={resolved()}>
        <span class={cls().status} data-slot="comment-thread-resolved">
          {messages().resolved}
        </span>
      </Show>
      <ol class={cls().comments} data-slot="comment-thread-comments">
        <For each={shown()}>
          {(comment: CommentData) => (
            <CommentItem
              comment={comment}
              threadId={id()}
              handlers={props}
              classes={cls()}
              pending={
                edits()[comment.id] !== undefined ||
                Object.keys(reacting()).some((key) => key.startsWith(`${comment.id}\u0000`))
              }
              error={errors()[comment.id]}
              onEdit={(draft) => edit(comment, draft)}
              onDelete={() => void remove(comment)}
              onReact={(emoji, add) => react(comment, emoji, add)}
            />
          )}
        </For>
        <For each={replies()}>
          {(pending: PendingReply) => (
            <CommentItem
              comment={{
                id: pending.key,
                author: pendingAuthor(),
                body: pending.draft.body,
                mentions: pending.draft.mentions,
                createdAt: pending.createdAt,
              }}
              threadId={id()}
              handlers={props}
              classes={cls()}
              pending
              error={pending.failed ? messages().sendFailed : undefined}
              onEdit={() => {}}
              onDelete={() => {}}
              onReact={() => {}}
              onRetry={
                pending.failed
                  ? () => {
                      const again = { ...pending, failed: false };
                      setReplies(replies().map((one) => (one.key === pending.key ? again : one)));
                      send(again);
                    }
                  : undefined
              }
              onDiscard={() => setReplies(replies().filter((one) => one.key !== pending.key))}
            />
          )}
        </For>
      </ol>
      <Show when={props.onReply !== undefined && !resolved()}>
        <div class={cls().reply} data-slot="comment-thread-reply">
          <Show
            when={replying()}
            fallback={
              <Button
                variant="ghost"
                size="sm"
                class={cls().replyButton}
                onPress={() => setReplying(true)}
              >
                {messages().reply}
              </Button>
            }
          >
            <Composer
              label={messages().reply}
              placeholder={messages().replyPlaceholder}
              submitLabel={messages().reply}
              mentionables={props.mentionables}
              classes={cls()}
              autoFocus
              onCancel={() => setReplying(false)}
              onSubmit={reply}
            />
          </Show>
        </div>
      </Show>
    </article>
  );
}

// --- the list of threads -------------------------------------------------------

export type CommentFilter = "open" | "resolved" | "all";

export interface CommentThreadListProps extends CommentHandlers, Customisable<Slots> {
  threads: readonly CommentThreadData[];
  /** @default arc's "Comments" */
  "aria-label"?: string;
  filter?: CommentFilter;
  /** @default "open" */
  defaultFilter?: CommentFilter;
  onFilterChange?: (filter: CommentFilter) => void;
  /** Only the threads on this anchor's `id`, with a chip that lets it go. */
  anchor?: string;
  onAnchorChange?: (anchor: string | undefined) => void;
  /** Adds a composer that starts a thread. */
  onCreate?: (draft: CommentDraft) => Outcome;
  /** Shown when no thread passes the filter. */
  empty?: Child;
}

/**
 * The comments on a document or a record: threads to filter by open and
 * resolved and by what they are on, and a composer for a new one.
 *
 * ```tsx
 * <CommentThreadList
 *   threads={threads()}
 *   currentUser={me}
 *   mentionables={members()}
 *   onReply={(thread, draft) => api.reply(thread, draft)}
 *   onResolve={(thread, resolved) => api.resolve(thread, resolved)}
 *   onCreate={(draft) => api.start(draft)}
 * />
 * ```
 */
export function CommentThreadList(props: CommentThreadListProps) {
  const Composer = props.composer ?? CommentComposer;
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(commentsStyles(), props.classes);
  }
  const [ownFilter, setOwnFilter] = createSignal<CommentFilter>(props.defaultFilter ?? "open", {
    ownedWrite: true,
  });
  const [ownAnchor, setOwnAnchor] = createSignal<string | undefined>(undefined);
  const [starting, setStarting] = createSignal<readonly CommentDraft[]>([]);
  function filter(): CommentFilter {
    return props.filter ?? ownFilter();
  }
  function anchor(): string | undefined {
    return props.anchor ?? ownAnchor();
  }
  function onAnchor(): CommentThreadData[] {
    return props.threads.filter(
      (thread) => anchor() === undefined || thread.anchor?.id === anchor(),
    );
  }
  function count(which: CommentFilter): number {
    return onAnchor().filter((thread) =>
      which === "all" ? true : (thread.resolved === true) === (which === "resolved"),
    ).length;
  }
  function visible(): CommentThreadData[] {
    return onAnchor().filter((thread) =>
      filter() === "all" ? true : (thread.resolved === true) === (filter() === "resolved"),
    );
  }
  function anchorLabel(): string {
    const found = props.threads.find((thread) => thread.anchor?.id === anchor())?.anchor;
    return found?.label ?? found?.quote ?? anchor() ?? "";
  }
  function choose(next: CommentFilter): void {
    if (props.filter === undefined) setOwnFilter(next);
    props.onFilterChange?.(next);
  }
  function create(draft: CommentDraft): void {
    setStarting([...starting(), draft]);
    optimistic(props.onCreate?.(draft), () =>
      setStarting(starting().filter((one) => one !== draft)),
    );
  }
  const words: Record<CommentFilter, () => string> = {
    open: () => messages().openThreads,
    resolved: () => messages().resolvedThreads,
    all: () => messages().allThreads,
  };

  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      data-slot="comment-thread-list"
      aria-label={props["aria-label"] ?? messages().comments}
    >
      <div class={cls().filters} data-slot="comment-thread-filters">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter()}
          aria-label={messages().filters}
          onValueChange={(value: string | string[]) => {
            if (typeof value === "string" && value !== "") choose(value as CommentFilter);
          }}
        >
          <For each={["open", "resolved", "all"] as CommentFilter[]}>
            {(which: CommentFilter) => (
              <ToggleGroupItem value={which}>
                {`${words[which]()} ${String(count(which))}`}
              </ToggleGroupItem>
            )}
          </For>
        </ToggleGroup>
        <Show when={anchor() !== undefined}>
          <Chip
            size="sm"
            onRemove={() => {
              if (props.anchor === undefined) setOwnAnchor(undefined);
              props.onAnchorChange?.(undefined);
            }}
          >
            {messages().threadOn(anchorLabel())}
          </Chip>
        </Show>
      </div>
      <Show
        when={visible().length > 0 || starting().length > 0}
        fallback={props.empty ?? <EmptyState heading={messages().noComments} />}
      >
        <ul class={cls().list} data-slot="comment-thread-items">
          <For each={visible()}>
            {(thread: CommentThreadData) => (
              <li>
                <CommentThread
                  {...props}
                  thread={thread}
                  classes={props.classes}
                  class={undefined}
                />
              </li>
            )}
          </For>
          <For each={starting()}>
            {(draft: CommentDraft) => (
              <li>
                <article class={cls().thread} data-slot="comment-thread" data-pending="">
                  <ol class={cls().comments} data-slot="comment-thread-comments">
                    <CommentItem
                      comment={{
                        id: "pending",
                        author: props.currentUser ?? { id: "", name: messages().you },
                        body: draft.body,
                        mentions: draft.mentions,
                        createdAt: new Date(),
                      }}
                      threadId=""
                      handlers={props}
                      classes={cls()}
                      pending
                      onEdit={() => {}}
                      onDelete={() => {}}
                      onReact={() => {}}
                    />
                  </ol>
                </article>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={props.onCreate !== undefined}>
        <Composer
          label={messages().newComment}
          placeholder={messages().commentPlaceholder}
          mentionables={props.mentionables}
          classes={props.classes}
          onSubmit={create}
        />
      </Show>
    </section>
  );
}
