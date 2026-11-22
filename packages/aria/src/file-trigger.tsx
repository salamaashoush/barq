/**
 * A file trigger: any pressable control opens the platform's file picker.
 *
 * The picker can only be opened by a click on an `<input type="file">`, and
 * that input is hard to style and harder to label. So the input is rendered
 * hidden and the control the caller wrote is the one the user sees, presses
 * and hears announced. A press on it clicks the input.
 *
 * The input is emptied before each click. Picking the same file twice in a row
 * fires no `change` otherwise, and a user re-uploading a file they just edited
 * would see nothing happen.
 */

import { cells, type Child, createContext, getContext, provide } from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import {
  filterDOMProps,
  fromProps,
  mergeProps,
  provideTriggerSlot,
  type StyleProps,
} from "./utils.ts";

export interface FileTriggerValue {
  /** Open the file picker, as a press on the trigger does. */
  open(): void;
}

const FileTriggerContext = createContext<FileTriggerValue | null>(null);

/**
 * The enclosing {@link FileTrigger}, for a control this package does not
 * provide: call `open()` from its own press handler.
 */
export function useFileTrigger(): FileTriggerValue | null {
  return getContext(FileTriggerContext) ?? null;
}

export interface FileTriggerComponentProps extends Omit<
  StyleProps,
  "class" | "className" | "style"
> {
  /** The control the user presses. A `<Button>` takes the press on its own. */
  children?: Child;
  /** The MIME types or extensions the picker offers. */
  acceptedFileTypes?: readonly string[];
  allowsMultiple?: boolean;
  /** Capture from a camera rather than the file system, on a device that has one. */
  defaultCamera?: "user" | "environment";
  /** Pick a directory rather than files. */
  acceptDirectory?: boolean;
  /** The hidden input, for a form or a test. */
  ref?: RefTarget<HTMLInputElement>;
  onSelect?: (files: FileList | null) => void;
}

/**
 * ```tsx
 * <FileTrigger acceptedFileTypes={["image/png"]} onSelect={(files) => upload(files)}>
 *   <Button>Upload</Button>
 * </FileTrigger>
 * ```
 */
export function FileTrigger(props: FileTriggerComponentProps) {
  const inputRef = makeRef<HTMLInputElement>();

  const open = (): void => {
    const input = inputRef();
    if (input === null) return;
    if (input.value !== "") input.value = "";
    input.click();
  };

  const value: FileTriggerValue = { open };

  const inputProps = mergeProps(filterDOMProps(fromProps(cells(props)), { global: true }), {
    type: "file",
    style: { display: "none" },
    accept: () => props.acceptedFileTypes?.toString(),
    multiple: () => props.allowsMultiple === true || undefined,
    capture: () => props.defaultCamera,
    webkitdirectory: () => (props.acceptDirectory === true ? "" : undefined),
    "data-testid": () => props["data-testid"],
    // The click this component makes must not bubble on as a click on whatever
    // contains the trigger.
    onClick: (event: MouseEvent) => event.stopPropagation(),
    onChange: (event: Event) => props.onSelect?.((event.target as HTMLInputElement).files),
  });

  return (
    <>
      {provide(
        FileTriggerContext,
        () => value,
        () => {
          provideTriggerSlot({ props: { onPress: open } });
          return props.children;
        },
      )}
      <input {...inputProps} ref={mergeRefs(inputRef.set, props.ref)} />
    </>
  );
}
