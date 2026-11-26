import { type Child, For, Show, createSignal, createUniqueId, onCleanup } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { announce } from "@barqjs/aria/live";
import { Eye } from "@barqjs/lucide/icons/eye";
import { EyeOff } from "@barqjs/lucide/icons/eye-off";
import { Lock } from "@barqjs/lucide/icons/lock";
import { Button } from "@barqjs/ui/button";
import { Checkbox } from "@barqjs/ui/checkbox";
import { Label } from "@barqjs/ui/label";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, fg, gap, glyph, layout, rounded, space, tone, type } from "../style/index.ts";
import { CopyButton } from "./copy-button.tsx";
import { FormattedDate, type Moment } from "./format.tsx";
import { useArcMessages } from "./messages.ts";
import { Sentence } from "./sentence.tsx";
import { serverMessage } from "./server-message.ts";

export const maskedValueStyles = variants({
  slots: {
    root: arc(layout.inlineRow, gap[1], layout.minZero, { verticalAlign: "middle" }),
    value: arc(layout.minZero, { overflowWrap: "anywhere" }),
    reveal: arc({}),
    copy: arc({}),
    error: arc(type.meta, fg.danger),
  },
  variants: {
    mono: { true: { value: type.mono }, false: {} },
  },
  defaults: { mono: true },
});

type MaskedSlots = ReturnType<typeof maskedValueStyles>;

export interface MaskedValueProps extends Customisable<MaskedSlots> {
  /** Names what it is in the buttons: "the passport number" reads "Show the passport number". */
  label: string;
  /** The value, when the page already holds it. */
  value?: string;
  /** Fetches the value when the reader asks to see it, for one the page is not sent until then. */
  reveal?: () => Promise<string>;
  /** What shows while it is hidden. @default dots and the last `visibleEnd` characters of `value` */
  masked?: string;
  /** Characters at the end shown while it is hidden. @default 4 */
  visibleEnd?: number;
  /** Whether this reader may see it. @default true */
  canReveal?: boolean;
  /** A copy button, once the value is known. @default true */
  copyable?: boolean;
  /** Hides it again after this long shown, in milliseconds. */
  hideAfter?: number;
  /** In the code face. @default true */
  mono?: boolean;
}

const DOTS = "••••";

/**
 * A sensitive value shown masked, with a button that shows it to a reader
 * allowed to see it and one that copies it: an identity document's number,
 * a stored token, a variable marked secret.
 *
 * ```tsx
 * <MaskedValue label="the passport number" masked="•••• 4821" reveal={() => api.revealPassport(id)} />
 * <MaskedValue label="the token" value={token} hideAfter={30_000} />
 * ```
 *
 * `reveal` fetches the value only when it is asked for, so a page never
 * carries it unseen; a refused fetch says why beside it. The show button is
 * a toggle, pressed while the value shows.
 */
export function MaskedValue(props: MaskedValueProps) {
  const messages = useArcMessages();
  const [fetched, setFetched] = createSignal<string | null>(null);
  const [shown, setShown] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  function cls(): MaskedSlots {
    return parts(maskedValueStyles({ mono: props.mono !== false }), props.classes);
  }
  function known(): string | undefined {
    return props.value ?? fetched() ?? undefined;
  }
  function masked(): string {
    if (props.masked !== undefined) return props.masked;
    const value = props.value;
    const end = props.visibleEnd ?? 4;
    if (value === undefined || end <= 0 || value.length <= end * 2) return `${DOTS}${DOTS}`;
    return `${DOTS} ${value.slice(-end)}`;
  }
  function revealable(): boolean {
    return props.canReveal !== false && (props.value !== undefined || props.reveal !== undefined);
  }
  function hideLater(): void {
    clearTimeout(timer);
    if (props.hideAfter !== undefined) timer = setTimeout(() => setShown(false), props.hideAfter);
  }
  async function toggle(): Promise<void> {
    if (shown()) {
      clearTimeout(timer);
      setShown(false);
      return;
    }
    if (known() === undefined && props.reveal !== undefined) {
      setPending(true);
      setFailure(null);
      try {
        setFetched(await props.reveal());
      } catch (error) {
        const words = serverMessage(error, messages().couldNotReveal);
        setFailure(words);
        announce(words, "assertive");
        return;
      } finally {
        setPending(false);
      }
    }
    setShown(true);
    hideLater();
  }
  return (
    <span class={arc(cls().root, props.class, props.className)} data-slot="masked-value">
      <span
        class={cls().value}
        data-slot="masked-value-value"
        data-shown={shown() ? "" : undefined}
        dir="ltr"
      >
        <Show
          when={shown()}
          fallback={
            <>
              <span aria-hidden="true">{masked()}</span>
              <span class={srOnly}>{messages().hiddenValue}</span>
            </>
          }
        >
          {known()}
        </Show>
      </span>
      <Show when={revealable()}>
        <Button
          variant="ghost"
          size="icon-sm"
          class={cls().reveal}
          data-slot="masked-value-reveal"
          aria-label={
            shown() ? messages().hideNamed(props.label) : messages().showNamed(props.label)
          }
          aria-pressed={shown()}
          isPending={pending()}
          onPress={() => void toggle()}
        >
          {shown() ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </Show>
      <Show when={props.copyable !== false && props.canReveal !== false && known() !== undefined}>
        <CopyButton
          value={known() ?? ""}
          label={messages().copyOf(props.label)}
          class={cls().copy}
        />
      </Show>
      <Show when={failure() !== null}>
        <span class={cls().error} data-slot="masked-value-error">
          {failure()}
        </span>
      </Show>
    </span>
  );
}

export const oneTimeSecretStyles = variants({
  slots: {
    root: arc(edge.all, edge.tone, rounded.lg, bg.tone, layout.column, gap[3], {
      padding: space.x4,
    }),
    heading: arc(type.label, layout.flush),
    hint: arc(type.body, fg.muted),
    secret: arc(layout.row, gap[2], bg.card, rounded.md, edge.all, {
      alignItems: "flex-start",
      paddingBlock: space.x2,
      paddingInlineStart: space.x3,
      paddingInlineEnd: space.x1,
    }),
    value: arc(type.mono, type.sm, type.written, layout.grow, layout.minZero, layout.flush, {
      paddingBlockStart: space.x1,
    }),
    copy: arc(layout.noShrink),
    expiry: arc(type.meta),
    acknowledge: arc(layout.row, gap[2], type.body),
    done: arc({ alignSelf: "flex-start" }),
  },
  variants: {
    tone: {
      success: { root: tone.success },
      warning: { root: tone.warning },
    },
  },
  defaults: { tone: "success" },
});

type OneTimeSlots = ReturnType<typeof oneTimeSecretStyles>;

export interface OneTimeSecretProps extends Customisable<OneTimeSlots> {
  /** The secret, which the server does not show again. */
  value: string;
  /** @default "Copy your new secret" */
  heading?: Child;
  /** @default "Copy it now. It is not shown again." */
  hint?: Child;
  /** When it stops working, said under it. */
  expiresAt?: Moment;
  /** `warning` for what unlocks an account, such as recovery codes. @default "success" */
  tone?: "success" | "warning";
  /** Names the copy button. @default "Copy the secret" */
  copyLabel?: string;
  /** Adds "I have stored it somewhere safe", which Done waits for. */
  onDone?: () => void;
  /** @default "I have stored it somewhere safe" */
  acknowledgeLabel?: Child;
  /** @default "Done" */
  doneLabel?: Child;
}

/**
 * A secret shown once, right after it was made: an API key, a signing
 * secret, a share link. Its words, the value with a copy button, and when it
 * expires, announced politely as it appears.
 *
 * ```tsx
 * <FormDialog form={form} heading="Create an API key" result={() => <OneTimeSecret value={made()?.secret ?? ""} />}>…</FormDialog>
 * <OneTimeSecret value={token} heading="Key k8s-prod" onDone={close} />
 * ```
 *
 * The value wraps rather than scrolls, so all of a long one is in view.
 * With `onDone` the reader ticks that it is stored before Done works.
 * `handOffSecret` carries one to the next page to show there.
 */
export function OneTimeSecret(props: OneTimeSecretProps) {
  const messages = useArcMessages();
  const checkId = createUniqueId();
  const [stored, setStored] = createSignal(false);
  function cls(): OneTimeSlots {
    return parts(oneTimeSecretStyles({ tone: props.tone ?? "success" }), props.classes);
  }
  return (
    <section
      class={arc(cls().root, props.class, props.className)}
      role="status"
      data-slot="one-time-secret"
      data-tone={props.tone ?? "success"}
    >
      <p class={cls().heading} data-slot="one-time-secret-heading">
        {props.heading ?? messages().newSecretHeading}
      </p>
      <p class={cls().hint} data-slot="one-time-secret-hint">
        {props.hint ?? messages().shownOnce}
      </p>
      <div class={cls().secret} data-slot="one-time-secret-value">
        <code class={cls().value} dir="ltr">
          {props.value}
        </code>
        <CopyButton
          value={props.value}
          label={props.copyLabel ?? messages().copySecret}
          class={cls().copy}
        />
      </div>
      <Show when={props.expiresAt !== undefined}>
        <p class={cls().expiry} data-slot="one-time-secret-expiry">
          <Sentence words={messages().worksUntil}>
            <FormattedDate
              value={props.expiresAt ?? 0}
              options={{ dateStyle: "medium", timeStyle: "short" }}
            />
          </Sentence>
        </p>
      </Show>
      <Show when={props.onDone !== undefined}>
        <div class={cls().acknowledge} data-slot="one-time-secret-acknowledge">
          <Checkbox id={checkId} isSelected={stored()} onChange={setStored} />
          <Label for={checkId}>{props.acknowledgeLabel ?? messages().storedItSafely}</Label>
        </div>
        <Button
          class={cls().done}
          data-slot="one-time-secret-done"
          isDisabled={!stored()}
          onPress={() => props.onDone?.()}
        >
          {props.doneLabel ?? messages().done}
        </Button>
      </Show>
    </section>
  );
}

const handedOff = new Map<string, string>();

/**
 * Hold a secret just made for the next page to show once, in this tab's
 * memory: never in the address, never in storage, gone on a reload. A key
 * made in a dialog reaches the install page that fills it in.
 */
export function handOffSecret(key: string, value: string): void {
  handedOff.set(key, value);
}

/** The secret handed off under `key`, which it takes: a second call has nothing. */
export function takeSecret(key: string): string | undefined {
  const value = handedOff.get(key);
  handedOff.delete(key);
  return value;
}

export const redactedSecretStyles = variants({
  slots: {
    root: arc(
      layout.inlineRow,
      gap[1],
      rounded.sm,
      bg.muted,
      fg.muted,
      type.mono,
      type.xs,
      glyph.sm,
      {
        paddingInline: space.x1,
        verticalAlign: "baseline",
      },
    ),
    name: arc({}),
    reason: srOnly,
  },
});

type RedactedSlots = ReturnType<typeof redactedSecretStyles>;

export interface RedactedSecretProps extends Customisable<RedactedSlots> {
  /** The secret's name: `TOKEN`. Left out, it reads "redacted". */
  name?: string;
  /** Why it is not shown, read after it and shown on hover: "Removed by the runner". */
  reason?: string;
}

/**
 * Where a secret was taken out of text, as a marker naming it rather than a
 * gap: a log line, a request, a recorded step. A lock and the name, read as
 * "Secret TOKEN" and then the reason.
 *
 * ```tsx
 * <RedactedSecret name="API_TOKEN" reason="Removed by the runner" />
 * ```
 */
export function RedactedSecret(props: RedactedSecretProps) {
  const messages = useArcMessages();
  function cls(): RedactedSlots {
    return parts(redactedSecretStyles(), props.classes);
  }
  return (
    <span
      class={arc(cls().root, props.class, props.className)}
      data-slot="redacted-secret"
      title={props.reason}
      dir="ltr"
    >
      <Lock aria-hidden="true" />
      <span class={srOnly}>{messages().secretWord} </span>
      <span class={cls().name} data-slot="redacted-secret-name">
        {props.name ?? messages().redacted}
      </span>
      <Show when={props.reason !== undefined}>
        <span class={cls().reason}>{`, ${props.reason ?? ""}`}</span>
      </Show>
    </span>
  );
}

export interface RedactedPiece {
  text: string;
  /** Present on a marker: the secret's name, or `""` for one with none. */
  secret?: string;
}

/** `[redacted]` and `[redacted: NAME]`, case aside. */
const REDACTION = /\[redacted(?::\s*([^\]\s]+)\s*)?\]/gi;

/** `text` cut at each match of `pattern`, the matches as the names they carry. */
export function redactedPieces(text: string, pattern: RegExp = REDACTION): RedactedPiece[] {
  const global = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  const pieces: RedactedPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(global)) {
    const at = match.index;
    if (at > last) pieces.push({ text: text.slice(last, at) });
    pieces.push({ text: match[0], secret: match[1] ?? "" });
    last = at + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}

export interface RedactedTextProps extends Customisable<RedactedSlots> {
  text: string;
  /**
   * What a redaction looks like in the text, its first group the secret's
   * name: `/<secret>(\w+)<\/secret>/g`. @default `[redacted]` and `[redacted: NAME]`
   */
  pattern?: RegExp;
  /** Why each was taken out. */
  reason?: (name: string | undefined) => string | undefined;
}

/**
 * Text with each redaction in it drawn as a `RedactedSecret`.
 *
 * ```tsx
 * <RedactedText text={line} pattern={/<secret>(\w+)<\/secret>/g} reason={(name) => `The value of ${name}, removed by the runner`} />
 * ```
 */
export function RedactedText(props: RedactedTextProps) {
  function pieces(): RedactedPiece[] {
    return redactedPieces(props.text, props.pattern);
  }
  return (
    <For each={pieces()}>
      {(piece: RedactedPiece) => (
        <Show when={piece.secret !== undefined} fallback={piece.text}>
          <RedactedSecret
            name={piece.secret === "" ? undefined : piece.secret}
            reason={props.reason?.(piece.secret === "" ? undefined : piece.secret)}
            class={props.class}
            className={props.className}
            classes={props.classes}
          />
        </Show>
      )}
    </For>
  );
}
