import { type Child, Show, createEffect, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { controllable } from "@barqjs/aria/utils";
import { urlStateLink, writeUrlState } from "@barqjs/primitives/url-state";
import { inputVariants } from "@barqjs/ui/input";
import { Spinner } from "@barqjs/ui/spinner";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, type } from "../style/index.ts";
import { InlineAlert } from "./alert.tsx";
import { CopyButton } from "./copy-button.tsx";
import { formatBytes } from "./file-upload.tsx";
import { useArcMessages } from "./messages.ts";
import { ResponsiveOverlay } from "./responsive-overlay.tsx";

export const shareDialogStyles = variants({
  slots: {
    root: arc({}),
    field: arc(layout.row, gap[2], layout.minZero),
    link: arc(inputVariants(), layout.grow, layout.minZero, type.mono),
    copy: arc(layout.noShrink),
    size: arc(type.meta, type.numeric),
    preparing: arc(layout.row, gap[2], type.meta, fg.muted),
  },
});

type Slots = ReturnType<typeof shareDialogStyles>;

export interface ShareDialogProps extends Customisable<Slots> {
  /** What the link carries: a JSON value, read each time the dialog opens. */
  state: unknown;
  /** The hash parameter it is kept under. @default "state" */
  stateKey?: string;
  /** The page the link opens. @default this page */
  base?: string;
  /** Also put the state in this page's own address, so the address bar is the link too. @default true */
  updateAddress?: boolean;
  /** Past this many characters a chat or a mail may cut the link short: a warning. @default 8000 */
  maxLength?: number;
  /** @default "Share" */
  heading?: Child;
  /** @default "Anyone with the link opens this as it is now." */
  description?: Child;
  /** The control that opens it: a `Button`. */
  trigger?: Child;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The link, once it is made. */
  onLink?: (link: string) => void;
}

interface Made {
  link: string;
  /** The state's JSON, in bytes. */
  original: number;
}

/**
 * A link that opens what the reader has now: a playground's files, a query
 * and its settings, a chart's options, kept in the link's hash.
 *
 * ```tsx
 * <ShareDialog state={workspace()} trigger={<Button>Share</Button>} />
 * ```
 *
 * When it opens the state is compressed into the link by `@barqjs/primitives`'
 * `urlStateLink` (`deflate-raw`, base64url) and, unless `updateAddress` is
 * off, written into the page's own address without a navigation. The page
 * that opens the link reads it back with `readUrlState`. The link is shown
 * with its length and how far the state shrank, copied with `CopyButton`,
 * and a warning stands beside a link long enough to be cut short. A dialog
 * on a wide screen, a sheet on a phone.
 */
export function ShareDialog(props: ShareDialogProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  function cls(): Slots {
    return parts(shareDialogStyles(), props.classes);
  }
  const [isOpen, setOpen] = controllable<boolean>(
    () => props.open,
    () => untrack(() => props.defaultOpen) ?? false,
    (next) => props.onOpenChange?.(next),
  );
  const [made, setMade] = createSignal<Made | undefined>(undefined);
  const [failed, setFailed] = createSignal(false);
  let attempt = 0;

  async function make(): Promise<void> {
    const mine = ++attempt;
    setMade(undefined);
    setFailed(false);
    const state = untrack(() => props.state);
    const options = { key: untrack(() => props.stateKey), base: untrack(() => props.base) };
    try {
      const link =
        untrack(() => props.updateAddress) === false || options.base !== undefined
          ? await urlStateLink(state, options)
          : await writeUrlState(state, options);
      if (mine !== attempt) return;
      setMade({ link, original: new TextEncoder().encode(JSON.stringify(state)).length });
      untrack(() => props.onLink)?.(link);
    } catch {
      if (mine === attempt) setFailed(true);
    }
  }

  if (!isServer) {
    createEffect(
      () => isOpen(),
      (open) => {
        if (open) void make();
      },
    );
  }

  function count(value: number): string {
    return new Intl.NumberFormat(locale().locale).format(value);
  }
  function encodedBytes(link: string): number {
    const at = link.indexOf("#");
    const hash = new URLSearchParams(at < 0 ? "" : link.slice(at + 1));
    return hash.get(props.stateKey ?? "state")?.length ?? 0;
  }

  return (
    <ResponsiveOverlay
      class={arc(cls().root, props.class, props.className)}
      heading={props.heading ?? messages().share}
      description={props.description ?? messages().shareDescription}
      trigger={props.trigger}
      open={isOpen()}
      onOpenChange={setOpen}
    >
      <Show
        when={!failed()}
        fallback={<InlineAlert tone="danger">{messages().shareFailed}</InlineAlert>}
      >
        <Show
          when={made()}
          fallback={
            <p class={cls().preparing} data-slot="share-dialog-preparing">
              <Spinner label={messages().sharePreparing} />
              {messages().sharePreparing}
            </p>
          }
        >
          {(link: () => Made) => (
            <>
              <div class={cls().field} data-slot="share-dialog-field">
                <input
                  class={cls().link}
                  data-slot="share-dialog-link"
                  aria-label={messages().shareLink}
                  readOnly
                  dir="ltr"
                  value={link().link}
                  onFocus={(event: FocusEvent) =>
                    (event.currentTarget as HTMLInputElement).select()
                  }
                />
                <CopyButton
                  class={cls().copy}
                  value={link().link}
                  label={messages().copyLink}
                  variant="default"
                >
                  {messages().copyLink}
                </CopyButton>
              </div>
              <p class={cls().size} data-slot="share-dialog-size">
                {messages().shareSize(
                  count(link().link.length),
                  formatBytes(link().original, locale().locale),
                  formatBytes(encodedBytes(link().link), locale().locale),
                )}
              </p>
              <Show when={link().link.length > (props.maxLength ?? 8000)}>
                <InlineAlert tone="warning" live="none">
                  {messages().shareTooLong}
                </InlineAlert>
              </Show>
            </>
          )}
        </Show>
      </Show>
    </ResponsiveOverlay>
  );
}
