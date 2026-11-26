import { type Child, Show, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { CircleX } from "@barqjs/lucide/icons/circle-x";
import { Button } from "@barqjs/ui/button";
import { Input } from "@barqjs/ui/input";

import { arcLayer as arc } from "../layer.ts";
import { type ArcFieldProps, Frame, fieldWiring } from "../lib/field.tsx";
import { type Classes, type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, glyph, layout, tone, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { ResponsiveOverlay, type responsiveOverlayStyles } from "./responsive-overlay.tsx";
import { serverMessage } from "./server-message.ts";

/** How a test went: whether it worked, and what happened in words, never the data it read. */
export interface ConnectionTestResult {
  ok: boolean;
  message: Child;
}

/** One thing to read as well as connecting: a secret's path, a table, a channel. */
export interface ConnectionTestProbe {
  label: Child;
  placeholder?: string;
  /** @default "Optional: something to read as well as connecting." */
  description?: Child;
}

export const connectionTestStyles = variants({
  slots: {
    form: arc(layout.column, gap[4]),
    probe: arc(type.mono),
    result: arc(layout.row, gap[2], type.body, glyph.md, { alignItems: "flex-start" }),
    ok: arc(tone.success, fg.tone),
    failed: arc(tone.danger, fg.tone),
    pending: arc(fg.muted),
    done: arc({}),
    test: arc({}),
  },
});

type Slots = ReturnType<typeof connectionTestStyles>;

type OverlaySlots = ReturnType<typeof responsiveOverlayStyles>;

export interface ConnectionTestDialogProps extends Customisable<Slots & Classes<OverlaySlots>> {
  /** @default "Test the connection" */
  heading?: Child;
  description?: Child;
  /** Connects, and reads `probe` when one is typed. A rejection is a failed test, said in the server's words. */
  onTest: (probe: string) => Promise<ConnectionTestResult>;
  /** Adds a field for one thing to read as well as connecting. */
  probe?: ConnectionTestProbe;
  trigger?: Child;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** @default "Test" */
  testLabel?: Child;
}

/**
 * A dialog that tests a configured connection, a secret store, a webhook,
 * a database, the way real use would, and says how it went without showing
 * anything it read.
 *
 * ```tsx
 * <ConnectionTestDialog heading={`Test ${store.name}`} trigger={<Button variant="outline">Test</Button>}
 *   probe={{ label: "Reference", placeholder: "web/stripe#api_key" }}
 *   onTest={(reference) => api.testStore(store.id, reference)} />
 * ```
 *
 * It stays open after a test, the outcome in a status line in its tone and
 * in words, so a setting can be fixed elsewhere and the test run again. A
 * test that throws is a failure in the server's words.
 */
export function ConnectionTestDialog(props: ConnectionTestDialogProps) {
  const messages = useArcMessages();
  const formId = createUniqueId();
  const wiring = fieldWiring(
    () => [],
    () => false,
  );
  const [isOpen, setOpen] = controllable<boolean>(
    () => props.open,
    () => props.defaultOpen ?? false,
    (next) => props.onOpenChange?.(next),
  );
  const [probe, setProbe] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [result, setResult] = createSignal<ConnectionTestResult | null>(null);
  function cls(): Slots {
    return parts(connectionTestStyles(), props.classes);
  }
  async function test(): Promise<void> {
    setPending(true);
    setResult(null);
    try {
      setResult(await props.onTest(probe().trim()));
    } catch (error) {
      setResult({ ok: false, message: serverMessage(error, messages().connectionTestFailed) });
    } finally {
      setPending(false);
    }
  }
  function close(next: boolean): void {
    if (!next && pending()) return;
    if (!next) setResult(null);
    setOpen(next);
  }
  function probeField(): ArcFieldProps {
    return { label: props.probe?.label };
  }
  function outcome(): string | undefined {
    if (pending()) return "pending";
    const done = result();
    if (done === null) return undefined;
    return done.ok ? "ok" : "failed";
  }
  function Footer() {
    return (
      <>
        <Button
          variant="outline"
          class={cls().done}
          data-slot="connection-test-done"
          isDisabled={pending()}
          onPress={() => close(false)}
        >
          {messages().done}
        </Button>
        <Button
          type="submit"
          form={formId}
          class={cls().test}
          data-slot="connection-test-run"
          isPending={pending()}
        >
          {props.testLabel ?? messages().test}
        </Button>
      </>
    );
  }
  return (
    <ResponsiveOverlay
      heading={props.heading ?? messages().testConnection}
      description={props.description}
      trigger={props.trigger}
      open={isOpen()}
      onOpenChange={close}
      class={arc(props.class, props.className)}
      classes={props.classes}
      footer={<Footer />}
    >
      <form
        id={formId}
        class={cls().form}
        noValidate
        data-slot="connection-test"
        onSubmit={(event: Event) => {
          event.preventDefault();
          if (!pending()) void test();
        }}
      >
        <Show when={props.probe !== undefined}>
          <Frame
            of={wiring}
            label={props.probe?.label}
            description={props.probe?.description ?? messages().probeHint}
            field={probeField()}
          >
            <Input
              class={cls().probe}
              data-slot="connection-test-probe"
              id={wiring.ids.control}
              value={probe()}
              placeholder={props.probe?.placeholder}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              dir="ltr"
              aria-describedby={wiring.describedBy(true)}
              onInput={(event: Event) => setProbe((event.currentTarget as HTMLInputElement).value)}
            />
          </Frame>
        </Show>
        <p
          class={arc(
            cls().result,
            pending() ? cls().pending : undefined,
            result()?.ok === true ? cls().ok : undefined,
            result()?.ok === false ? cls().failed : undefined,
          )}
          role="status"
          data-slot="connection-test-result"
          data-outcome={outcome()}
        >
          <Show when={pending()}>{messages().testingConnection}</Show>
          <Show when={!pending() && result() !== null}>
            <Show when={result()?.ok === true} fallback={<CircleX aria-hidden="true" />}>
              <CircleCheck aria-hidden="true" />
            </Show>
            <span>
              {result()?.ok === true ? messages().connectionWorked : messages().connectionFailed}{" "}
              {result()?.message}
            </span>
          </Show>
        </p>
      </form>
    </ResponsiveOverlay>
  );
}
