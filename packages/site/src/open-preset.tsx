/**
 * Open Preset, ported from
 * `apps/v4/app/(app)/(create)/components/open-preset.tsx`.
 *
 * Upstream pastes a nine-character preset code their server decodes. There is
 * no server here, so what this takes is the thing this page already produces: a
 * link to itself. Paste a `/create` URL or just its query string and the page
 * opens on that configuration — which is the same promise the code was making,
 * spelled in something you can read.
 *
 * The input is validated as you type rather than on submit, because a code that
 * cannot work should say so before you press the button, not after.
 */

import { signal, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldError,
  FieldLabel,
  Input,
} from "@barqjs/ui";

import { footerButton } from "./layout.ts";
import { read, write, type Design, type Params } from "./params.ts";

const ui = layer("barq.ui");

const row = ui({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 3)",
});

/**
 * A pasted link, as parameters.
 *
 * `null` for anything that names nothing this page knows, so a typo is refused
 * rather than silently opening the defaults — which would look like the button
 * doing nothing.
 */
export function parsePreset(input: string): Params | null {
  const text = input.trim();
  if (text === "") return null;
  const query = text.includes("?")
    ? text.slice(text.indexOf("?"))
    : `?${text.replace(/^[?#]/, "")}`;
  if (new URLSearchParams(query).size === 0) return null;
  const params = read(query);
  // `read` falls back on anything it does not recognise, so a string of pure
  // nonsense parses to the defaults. Comparing the round trip is what tells the
  // two apart: a preset that survives being written out again is a real one.
  return write(params) === "" ? null : params;
}

export function OpenPreset(props: Incoming<{ design: Design; class?: string }>) {
  const open = signal(false);
  const input = signal("");

  const parsed = (): Params | null => parsePreset(input());
  const invalid = (): boolean => input().trim() !== "" && parsed() === null;

  const submit = (): void => {
    const next = parsed();
    if (next === null) return;
    props.design().set(next);
    input.set("");
    open.set(false);
  };

  return (
    <Dialog
      isOpen={open()}
      onOpenChange={(next: boolean) => {
        open.set(next);
        if (!next) input.set("");
      }}
    >
      <DialogTrigger>
        <Button variant="outline" class={ui(footerButton, props.class?.())} data-slot="open-preset">
          Open Preset
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open Preset</DialogTitle>
          <DialogDescription>Paste a link to a configuration to load it.</DialogDescription>
        </DialogHeader>
        <div class={row}>
          <Field isInvalid={invalid()}>
            <FieldLabel for="preset">Link</FieldLabel>
            <Input
              id="preset"
              placeholder="?style=nova&baseColor=stone&theme=blue"
              value={input()}
              aria-invalid={invalid()}
              onInput={(event: Event) => input.set((event.currentTarget as HTMLInputElement).value)}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key === "Enter") submit();
              }}
            />
            {invalid() ? (
              <FieldError>That is not a configuration this page knows.</FieldError>
            ) : null}
          </Field>
        </div>
        <DialogFooter>
          <DialogClose>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onPress={submit} isDisabled={parsed() === null}>
            Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
