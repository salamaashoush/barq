/**
 * A text area on its own: a `<textarea>` with the interaction states a
 * stylesheet needs.
 *
 * A labelled, validated multi-line field is `<TextField isMultiLine>`, which
 * wires the label, description and error message to the control. This is the
 * control alone, for a caller that labels it some other way: a chat composer
 * named by `aria-label`, a cell editor inside a grid.
 */

import { cells, type Accessor } from "@barqjs/core";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { focusRing } from "./focus.ts";
import { hover, type HoverEvent } from "./interactions/hover.ts";
import {
  access,
  controllable,
  type DOMProps,
  filterDOMProps,
  fromProps,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

export interface TextAreaOptions {
  value?: MaybeAccessor<string | undefined>;
  defaultValue?: MaybeAccessor<string | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  isInvalid?: MaybeAccessor<boolean | undefined>;
  autoFocus?: MaybeAccessor<boolean | undefined>;
  onChange?: (value: string) => void;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
}

export interface TextAreaResult {
  textAreaProps: DOMProps;
  value: Accessor<string>;
  isHovered: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isFocusVisible: Accessor<boolean>;
}

export function textArea(options: TextAreaOptions = {}): TextAreaResult {
  const [value, setValue] = controllable<string>(
    () => access(options.value),
    () => access(options.defaultValue) ?? "",
    options.onChange,
  );
  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const isInvalid = (): boolean => access(options.isInvalid) === true;

  const { hoverProps, isHovered } = hover({
    isDisabled,
    onHoverStart: options.onHoverStart,
    onHoverEnd: options.onHoverEnd,
    onHoverChange: options.onHoverChange,
  });
  const { focusProps, isFocused, isFocusVisible } = focusRing({
    isTextInput: true,
    autoFocus: options.autoFocus,
  });

  const onInput = (event: Event): void => {
    const element = event.target as HTMLTextAreaElement;
    setValue(element.value);
    // A controlled owner that declined re-renders nothing on a value that did
    // not move, so the element is put back by hand.
    if (element.value !== value()) element.value = value();
  };

  return {
    value,
    isHovered,
    isFocused,
    isFocusVisible,
    textAreaProps: mergeProps(hoverProps, focusProps, {
      value,
      disabled: isDisabled,
      readOnly: () => access(options.isReadOnly) === true,
      required: () => access(options.isRequired) === true,
      autofocus: () => access(options.autoFocus) === true || undefined,
      "aria-invalid": () => isInvalid() || undefined,
      onInput,
      "data-hovered": isHovered,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-disabled": isDisabled,
      "data-invalid": isInvalid,
    }),
  };
}

const TEXTAREA_ATTRIBUTES = new Set([
  "aria-controls",
  "aria-activedescendant",
  "aria-autocomplete",
  "aria-errormessage",
  "aria-haspopup",
  "onKeyDown",
  "onKeyUp",
  "onBeforeInput",
  "onSelect",
  "onCopy",
  "onCut",
  "onPaste",
  "onCompositionStart",
  "onCompositionEnd",
  "onCompositionUpdate",
]);

export interface TextAreaComponentProps extends StyleProps {
  value?: string;
  defaultValue?: string;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  autoFocus?: boolean;
  name?: string;
  form?: string;
  placeholder?: string;
  rows?: number;
  cols?: number;
  wrap?: "hard" | "soft" | "off";
  maxLength?: number;
  minLength?: number;
  autoComplete?: string;
  spellcheck?: boolean | "true" | "false";
  inputMode?: string;
  enterKeyHint?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-details"?: string;
  "aria-controls"?: string;
  "aria-activedescendant"?: string;
  "aria-autocomplete"?: "none" | "inline" | "list" | "both";
  "aria-errormessage"?: string;
  ref?: RefTarget<HTMLTextAreaElement>;
  onChange?: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
  onBeforeInput?: (event: InputEvent) => void;
  onHoverStart?: (event: HoverEvent) => void;
  onHoverEnd?: (event: HoverEvent) => void;
  onHoverChange?: (isHovered: boolean) => void;
}

/**
 * ```tsx
 * <TextArea aria-label="Message" rows={4} onChange={(text) => draft.set(text)} />
 * ```
 */
export function TextArea(props: TextAreaComponentProps) {
  const options = fromProps(cells(props));
  const { textAreaProps } = textArea(options);

  const elementProps = mergeProps(
    textAreaProps,
    {
      name: () => props.name,
      form: () => props.form,
      placeholder: () => props.placeholder,
      rows: () => props.rows,
      cols: () => props.cols,
      wrap: () => props.wrap,
      maxlength: () => props.maxLength,
      minlength: () => props.minLength,
      autocomplete: () => props.autoComplete,
      spellcheck: () => props.spellcheck,
      inputmode: () => props.inputMode,
      enterkeyhint: () => props.enterKeyHint,
    },
    filterDOMProps(options, { global: true, labelable: true, propNames: TEXTAREA_ATTRIBUTES }),
    styleProps(cells(props)),
    { "data-testid": () => props["data-testid"] },
  );

  return <textarea {...elementProps} ref={mergeRefs(props.ref)} />;
}
