import { type Child, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type DropEvent, drop, isFileDropItem, isTextDropItem } from "@barqjs/aria/dnd";
import { FileTrigger } from "@barqjs/aria/file-trigger";
import { useLocale } from "@barqjs/aria/i18n";
import { announce } from "@barqjs/aria/live";
import { Upload } from "@barqjs/lucide/icons/upload";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { Button } from "@barqjs/ui/button";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@barqjs/ui/input-group";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
  withOwnErrors,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { textDirection } from "../lib/text-direction.ts";
import { edge, gap, layout, tone, truncate, type } from "../style/index.ts";
import { checkFiles, formatBytes } from "./file-upload.tsx";
import { useArcMessages } from "./messages.ts";

export const fileOrPasteFieldStyles = variants({
  slots: {
    group: arc({}),
    input: arc({ maxBlockSize: "16rem" }),
    over: arc(tone.info, edge.tone),
    bar: arc(layout.row, layout.wrap, gap[2], edge.top),
    choose: arc({}),
    source: arc(type.meta, layout.minZero, truncate),
  },
  variants: {
    mono: { true: { input: type.mono }, false: {} },
  },
  defaults: { mono: true },
});

type Slots = ReturnType<typeof fileOrPasteFieldStyles> & FieldSlots;

export interface FileOrPasteFieldProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<string>, Customisable<Slots> {
  /** The files a pick offers and a drop takes: `[".pem", ".crt"]`, `["application/json"]`. */
  accept?: readonly string[];
  /** In bytes: a larger file is refused with why, and nothing is read. */
  maxSize?: number;
  /** @default 6 */
  rows?: number;
  placeholder?: string;
  /** In the code face, for a key, a certificate, JSON or CSV. @default true */
  mono?: boolean;
  /** @default "Choose a file" */
  chooseLabel?: string;
}

/**
 * Text pasted in, or read from a file: a certificate, a private key, a
 * storage state as JSON, a CSV. One field for both, so neither way in is a
 * second form.
 *
 * ```tsx
 * <form.AppField name="certificate">
 *   {(field) => <field.FileOrPasteField label="Certificate" accept={[".pem", ".crt"]} placeholder="-----BEGIN CERTIFICATE-----" />}
 * </form.AppField>
 * ```
 *
 * A file chosen with the button, which is the way in on a phone, or dropped
 * on the text area replaces what it holds, and the line beside the button
 * names the file and its size until the text is edited. A file `accept` or
 * `maxSize` refuses is not read, and the reason is said under the field.
 */
export function FileOrPasteField(props: FileOrPasteFieldProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const of = bindField<string>(props, "");
  const area = makeRef<HTMLTextAreaElement>();
  const [source, setSource] = createSignal<string | null>(null);
  const [refused, setRefused] = createSignal<string | null>(null);
  function cls(): Slots {
    return parts(
      { ...fieldStyles(), ...fileOrPasteFieldStyles({ mono: props.mono !== false }) },
      props.classes,
    );
  }
  const wiring = withOwnErrors(of, () => {
    const reason = refused();
    return reason === null ? [] : [reason];
  });

  async function read(file: File): Promise<void> {
    const { accepted, rejected } = checkFiles(
      [file],
      { accept: untrack(() => props.accept), maxSize: untrack(() => props.maxSize), maxFiles: 1 },
      untrack(messages),
      untrack(locale).locale,
    );
    const reason = rejected[0]?.reason;
    if (reason !== undefined || accepted.length === 0) {
      setRefused(reason ?? null);
      if (reason !== undefined) announce(reason, "polite");
      return;
    }
    const text = await file.text();
    setRefused(null);
    of.change(text);
    of.blur();
    const named = messages().readFromFile(
      file.name,
      formatBytes(file.size, untrack(locale).locale),
    );
    setSource(named);
    announce(named, "polite");
  }

  async function dropped(event: DropEvent): Promise<void> {
    const item = event.items[0];
    if (item === undefined) return;
    if (isFileDropItem(item)) {
      await read(await item.getFile());
      return;
    }
    if (isTextDropItem(item) && item.types.has("text/plain")) {
      setSource(null);
      setRefused(null);
      of.change(await item.getText("text/plain"));
    }
  }

  const { dropProps, isDropTarget } = drop({
    ref: area,
    isDisabled: () => props.isDisabled === true,
    getDropOperation: (_types, allowed) => (allowed.includes("copy") ? "copy" : "cancel"),
    onDrop: (event: DropEvent) => void dropped(event),
  });

  function sourceLine(): Child {
    return source() ?? messages().orPasteIt;
  }

  return (
    <Frame
      of={wiring}
      label={props.label}
      description={props.description}
      field={props}
      slot="file-or-paste-field"
    >
      <InputGroup
        class={arc(cls().group, cls().control, isDropTarget() ? cls().over : undefined)}
        data-slot="file-or-paste-field-group"
        data-drop-target={isDropTarget() ? "" : undefined}
        isDisabled={props.isDisabled}
      >
        <InputGroupTextarea
          {...dropProps}
          class={cls().input}
          data-slot="file-or-paste-field-input"
          id={wiring.ids.control}
          name={of.name()}
          value={of.value() ?? ""}
          rows={props.rows ?? 6}
          placeholder={props.placeholder}
          dir={props.mono === false ? (textDirection(of.value() ?? "") ?? undefined) : "ltr"}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          disabled={props.isDisabled}
          required={props.isRequired}
          aria-invalid={wiring.isInvalid() ? true : undefined}
          aria-describedby={wiring.describedBy(props.description !== undefined)}
          ref={area.set}
          onInput={(event: Event) => {
            setSource(null);
            setRefused(null);
            of.change((event.currentTarget as HTMLTextAreaElement).value);
          }}
          onBlur={of.blur}
        />
        <InputGroupAddon align="block-end" class={cls().bar} data-slot="file-or-paste-field-bar">
          <FileTrigger
            acceptedFileTypes={props.accept}
            onSelect={(list: FileList | null) => {
              const file = list?.[0];
              if (file !== undefined) void read(file);
            }}
          >
            <Button
              variant="outline"
              size="sm"
              class={cls().choose}
              data-slot="file-or-paste-field-choose"
              isDisabled={props.isDisabled}
            >
              <Upload aria-hidden="true" />
              {props.chooseLabel ?? messages().chooseAFile}
            </Button>
          </FileTrigger>
          <span class={cls().source} data-slot="file-or-paste-field-source">
            {sourceLine()}
          </span>
        </InputGroupAddon>
      </InputGroup>
    </Frame>
  );
}
