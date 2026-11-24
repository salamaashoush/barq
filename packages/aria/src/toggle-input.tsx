import type { Accessor, Child, Incoming, ParentProps } from "@barqjs/core";
import { mergeRefs, type Ref, type RefTarget } from "@barqjs/primitives/refs";

import { HIDDEN_INPUT_STYLE, pressesInput, type ToggleElementType } from "./toggle.ts";
import { access, type DOMProps, mergeProps } from "./utils.ts";

export interface ToggleInputParts {
  elementType: ToggleElementType;
  outerProps: DOMProps;
  inputProps: DOMProps;
  focusProps: DOMProps;
  inputRef: Ref<HTMLInputElement>;
  ref: RefTarget<HTMLInputElement> | undefined;
  children: Incoming<ParentProps>["children"];
  isDisabled: Accessor<boolean>;
}

/**
 * A toggle's own element with its hidden input inside, the children after it.
 * A `<span>` forwards a press on itself to the input, which a `<label>` does
 * without being asked.
 */
export function toggleInput(parts: ToggleInputParts) {
  const { inputProps, focusProps, inputRef, ref, children } = parts;
  if (parts.elementType === "span") {
    const onClick = pressesInput(() => access(inputRef), parts.isDisabled);

    return (
      <span {...mergeProps(parts.outerProps, { onClick })}>
        <input
          {...mergeProps(inputProps, focusProps)}
          ref={mergeRefs(inputRef.set, ref)}
          style={HIDDEN_INPUT_STYLE}
        />
        {children}
      </span>
    );
  }

  return (
    <label {...parts.outerProps}>
      <input
        {...mergeProps(inputProps, focusProps)}
        ref={mergeRefs(inputRef.set, ref)}
        style={HIDDEN_INPUT_STYLE}
      />
      {children}
    </label>
  );
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== "";
}

export interface HelpTextParts {
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  description: Accessor<unknown>;
  /** What the error says, or nothing while the control is valid. */
  errorMessage: Accessor<unknown>;
}

/**
 * A toggle with its help text and its error after it.
 *
 * After, not inside: the label's content is the control's name, and text in it
 * would be read once as the name and again as the description. Nothing is
 * rendered for either while it has nothing to say.
 */
export function withHelpText(control: Child, parts: HelpTextParts) {
  return (
    <>
      {control}
      {() =>
        present(parts.description()) ? (
          <span {...parts.descriptionProps}>{parts.description() as Child}</span>
        ) : null
      }
      {() =>
        present(parts.errorMessage()) ? (
          <span {...parts.errorMessageProps}>{parts.errorMessage() as Child}</span>
        ) : null
      }
    </>
  );
}
