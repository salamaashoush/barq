/**
 * Validation: what is wrong with a field, and when to say so.
 *
 * Three things can find a problem, and they disagree about when the user
 * should hear about it:
 *
 * - **The browser.** `required`, `type="email"`, `min`, `pattern` — the native
 *   constraints. They are checked on submit and their messages are localised
 *   into the browser's own language, which no library can match.
 * - **The page.** A `validate` function, checked as the value changes.
 * - **The server.** Errors that came back from a submission, which the client
 *   could not have known.
 *
 * When they are SHOWN is the whole design, and it is what
 * `validationBehavior` decides:
 *
 * - `"aria"` (the default) never blocks a submit and shows everything as it
 *   happens. The field is described by its error and marked `aria-invalid`;
 *   the form still submits, because the page is in charge of what it accepts.
 * - `"native"` uses the platform's own validation: the browser refuses the
 *   submit, focuses the first bad field, and the error is shown from that
 *   point on rather than while the user is still typing. Errors typed AT are
 *   errors nobody has finished making yet.
 *
 * The browser's own error bubble is always suppressed. It appears at a fixed
 * place, in a fixed style, and vanishes after a few seconds — the message goes
 * into the page instead, where it stays and where `aria-describedby` can point
 * at it.
 */

import {
  type Accessor,
  context,
  effect,
  getOwner,
  install,
  isServer,
  signal,
  useContext,
} from "@barqjs/core";
import type { ElementRef } from "./interactions/press.ts";
import { setInteractionModality } from "./interactions/modality.ts";
import { access, type MaybeAccessor } from "./utils.ts";

export type ValidationBehavior = "aria" | "native";

/** What a field's validity is, and why. */
export interface ValidationResult {
  isInvalid: boolean;
  /** Every message, in the order they were found. */
  validationErrors: string[];
  /** Which constraint failed, when the browser is the one that found it. */
  validationDetails: ValidityState;
}

// `satisfies` rather than an annotation: typed as `ValidityState` this is a
// DOM interface, and spreading one to build `CUSTOM` would be spreading a class
// instance and losing its prototype.
const VALID = {
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valueMissing: false,
  valid: true,
} satisfies ValidityState;

const CUSTOM: ValidityState = { ...VALID, customError: true, valid: false };

export const VALID_RESULT: ValidationResult = {
  isInvalid: false,
  validationErrors: [],
  validationDetails: VALID,
};

/** Errors a submission came back with, by field name. */
export type ValidationErrors = Record<string, string | string[]>;

const FormValidationContext = context<ValidationErrors>({});

/** Hand a form's server errors to the fields inside it. */
export function provideValidationErrors(errors: MaybeAccessor<ValidationErrors>): void {
  const owner = getOwner();
  if (owner !== null) install(owner, FormValidationContext, () => access(errors));
}

// Wrapped in an object, because a context whose default IS `undefined` cannot
// tell "nobody provided one" from "somebody provided undefined".
const ValidationBehaviorContext = context<{ behavior?: ValidationBehavior }>({});

/**
 * One behaviour for every field inside a form.
 *
 * Setting it per field is how a form ends up half native and half ARIA, which
 * means half of it blocks submission and half does not.
 */
export function provideValidationBehavior(
  behavior: MaybeAccessor<ValidationBehavior | undefined>,
): void {
  const owner = getOwner();
  if (owner !== null) {
    install(owner, ValidationBehaviorContext, () => ({ behavior: access(behavior) }));
  }
}

/** What the enclosing form said, if anything. */
export function useValidationBehavior(): ValidationBehavior | undefined {
  return useContext(ValidationBehaviorContext)()?.behavior;
}

export type ValidateFunction<T> = (value: T) => string | string[] | true | null | undefined;

export interface FormValidationStateOptions<T> {
  value: MaybeAccessor<T>;
  /** @default "aria" */
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
  /** Said by the caller, whatever anything else found. */
  isInvalid?: MaybeAccessor<boolean | undefined>;
  validate?: ValidateFunction<T>;
  /** The form field name, for matching a server error to this field. */
  name?: MaybeAccessor<string | string[] | undefined>;
  /** What the browser found, when the field has a native control. */
  builtinValidation?: Accessor<ValidationResult | undefined>;
}

export interface FormValidationState {
  /** As it stands now, whatever is being shown. */
  realtimeValidation: Accessor<ValidationResult>;
  /** What the user is being told, which lags behind under `"native"`. */
  displayValidation: Accessor<ValidationResult>;
  updateValidation(result: ValidationResult): void;
  resetValidation(): void;
  /** Show what has been found. Blur, change and submit all do this. */
  commitValidation(): void;
}

function asArray(value: string | string[] | undefined | null): string[] {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function resultFor(errors: string[]): ValidationResult | null {
  if (errors.length === 0) return null;
  return { isInvalid: true, validationErrors: errors, validationDetails: CUSTOM };
}

function sameResult(a: ValidationResult, b: ValidationResult): boolean {
  return (
    a.isInvalid === b.isInvalid &&
    a.validationErrors.length === b.validationErrors.length &&
    a.validationErrors.every((error, at) => error === b.validationErrors[at]) &&
    a.validationDetails === b.validationDetails
  );
}

export function formValidationState<T>(
  options: FormValidationStateOptions<T>,
): FormValidationState {
  // The field's own, then the form's, then the default.
  const inherited = useValidationBehavior();
  const behavior = (): ValidationBehavior =>
    access(options.validationBehavior) ?? inherited ?? "aria";

  /** What the caller said, which nothing else can argue with. */
  const controlled = (): ValidationResult | null => {
    const invalid = access(options.isInvalid);
    if (invalid === undefined) return null;
    return { isInvalid: invalid, validationErrors: [], validationDetails: CUSTOM };
  };

  const client = (): ValidationResult | null => {
    const validate = options.validate;
    if (validate === undefined) return null;
    const value = access(options.value) as T;
    if (value === null || value === undefined) return null;
    const errors = validate(value);
    return resultFor(errors === true ? [] : asArray(errors));
  };

  const builtin = (): ValidationResult | null => {
    const found = options.builtinValidation?.();
    if (found === undefined || found.validationDetails.valid) return null;
    return found;
  };

  /**
   * A server error is CLEARED by the next edit.
   *
   * The user changing the value has invalidated whatever the server said about
   * the old one, and leaving it up would be telling them they still have a
   * problem they have just fixed.
   */
  const serverCleared = signal(false);
  let lastErrors: ValidationErrors | undefined;

  // The CELL, read once here where there is an owner. Reading the context on
  // every call would throw from an event handler, which is where a commit
  // comes from.
  const serverErrors = useContext(FormValidationContext);

  const server = (): ValidationResult | null => {
    const errors = serverErrors() ?? {};
    if (errors !== lastErrors) {
      lastErrors = errors;
      serverCleared.set(false);
    }
    if (serverCleared()) return null;

    const name = access(options.name);
    if (name === undefined) return null;
    const messages = Array.isArray(name)
      ? name.flatMap((entry) => asArray(errors[entry]))
      : asArray(errors[name]);
    return resultFor(messages);
  };

  /** What has been found but not yet shown, under `"native"`. */
  let pending: ValidationResult = VALID_RESULT;
  const shown = signal<ValidationResult>(VALID_RESULT);

  const realtimeValidation = (): ValidationResult =>
    controlled() ?? server() ?? client() ?? builtin() ?? VALID_RESULT;

  const displayValidation = (): ValidationResult => {
    if (behavior() === "native") return controlled() ?? server() ?? shown();
    return controlled() ?? server() ?? client() ?? builtin() ?? shown();
  };

  return {
    realtimeValidation,
    displayValidation,
    updateValidation: (result) => {
      // Under `"aria"` everything is shown as it happens; under `"native"` it
      // waits for a commit.
      if (behavior() === "aria") {
        if (!sameResult(shown(), result)) shown.set(result);
        return;
      }
      pending = result;
    },
    resetValidation: () => {
      // Back to valid even if the native validity still says otherwise: it
      // will say so again on the next submit.
      if (!sameResult(shown(), VALID_RESULT)) shown.set(VALID_RESULT);
      pending = VALID_RESULT;
      serverCleared.set(true);
    },
    commitValidation: () => {
      serverCleared.set(true);
      if (behavior() !== "native") return;
      const found = client() ?? builtin() ?? pending;
      if (!sameResult(shown(), found)) shown.set(found);
    },
  };
}

// ---------------------------------------------------------------------------
// What a field wires up
// ---------------------------------------------------------------------------

export interface FieldValidationOptions<T> extends FormValidationStateOptions<T> {
  /** The caller's own message, which wins over anything found here. */
  errorMessage?: MaybeAccessor<unknown>;
}

export interface FieldValidation {
  state: FormValidationState;
  /** The field's own behaviour, or the form's, for {@link formValidation}. */
  behavior: Accessor<ValidationBehavior | undefined>;
  isInvalid: Accessor<boolean>;
  /** The messages to show, which may be the browser's own. */
  errors: Accessor<string[]>;
  /**
   * What the error element will HOLD, for {@link field}.
   *
   * `aria-describedby` has to point at it whether the message came from the
   * caller, the page or the browser, and an id pointing at an empty element is
   * announced as nothing.
   */
  errorMessage: Accessor<unknown>;
}

/**
 * The five things every validated field needs, wired together once.
 *
 * A field still calls {@link formValidation} itself when it has a native
 * control to attach to: that half needs the element, and half the fields here
 * (a listbox, a group of radios) do not have one.
 *
 * `validate` is NOT called for an absent value: `null` and `undefined` mean
 * the field is empty, and "empty" is `isRequired`'s business rather than a
 * page rule's. A validator handed an empty value would have to re-implement
 * required-ness, and would then disagree with the browser about it.
 */
export function fieldValidation<T>(options: FieldValidationOptions<T>): FieldValidation {
  const inherited = useValidationBehavior();

  const state = formValidationState<T>(options);

  const behavior = (): ValidationBehavior | undefined =>
    access(options.validationBehavior) ?? inherited;

  const isInvalid = (): boolean =>
    access(options.isInvalid) === true || state.displayValidation().isInvalid;

  const errors = (): string[] => state.displayValidation().validationErrors;

  const errorMessage = (): unknown => {
    const given = access(options.errorMessage);
    if (given !== undefined && given !== null && given !== "") return given;
    const found = errors();
    return found.length === 0 ? undefined : found.join(" ");
  };

  return { state, behavior, isInvalid, errors, errorMessage };
}

// ---------------------------------------------------------------------------
// The native half
// ---------------------------------------------------------------------------

/** An element the platform can validate. */
export type ValidatableElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | HTMLButtonElement;

export interface FormValidationOptions {
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
  /** Where to put focus when this field is the first invalid one. */
  focus?: () => void;
}

/** What the browser makes of an element, as a {@link ValidationResult}. */
export function nativeValidity(element: ValidatableElement): ValidationResult {
  const validity = element.validity;
  return {
    isInvalid: !validity.valid,
    validationErrors: validity.valid ? [] : [element.validationMessage],
    validationDetails: {
      badInput: validity.badInput,
      customError: validity.customError,
      patternMismatch: validity.patternMismatch,
      rangeOverflow: validity.rangeOverflow,
      rangeUnderflow: validity.rangeUnderflow,
      stepMismatch: validity.stepMismatch,
      tooLong: validity.tooLong,
      tooShort: validity.tooShort,
      typeMismatch: validity.typeMismatch,
      valueMissing: validity.valueMissing,
      valid: validity.valid,
    },
  };
}

/**
 * Wire a native control to a validation state.
 *
 * Three things happen here and each one is load-bearing:
 *
 * - The page's own errors are written onto the element with
 *   `setCustomValidity`, so the BROWSER refuses the submit rather than the
 *   page having to intercept it.
 * - The `invalid` event's default is prevented, which suppresses the browser's
 *   error bubble; the message goes into the page instead.
 * - The first invalid field in the form takes focus, with the focus ring
 *   showing, because a submit that silently does nothing is the most
 *   frustrating failure a form has.
 */
export function formValidation(
  options: FormValidationOptions,
  state: FormValidationState,
  ref: ElementRef<ValidatableElement>,
): void {
  if (isServer) return;

  const isNative = (): boolean => access(options.validationBehavior) === "native";

  effect(() => {
    const element = access(ref) as ValidatableElement | null;
    if (element === null || !isNative()) return;
    if (typeof element.setCustomValidity !== "function") return;
    if ((element as HTMLInputElement).disabled) return;

    const found = state.realtimeValidation();
    element.setCustomValidity(
      found.isInvalid ? found.validationErrors.join(" ") || "Invalid value." : "",
    );
    // Firefox shows the `title` in the validation bubble, so an empty one
    // keeps the page's message from being repeated in the browser's.
    if (!element.hasAttribute("title")) element.title = "";

    if (!found.isInvalid) state.updateValidation(nativeValidity(element));
  });

  effect(() => {
    const element = access(ref) as ValidatableElement | null;
    if (element === null) return undefined;

    const onInvalid = (event: Event): void => {
      // Only when nothing is being shown yet: committing over a server error
      // the user has not fixed would replace it with the browser's message.
      if (!state.displayValidation().isInvalid) state.commitValidation();

      const form = element.form;
      if (!event.defaultPrevented && form !== null) {
        const first = form.querySelector<ValidatableElement>(":invalid");
        if (first === element) {
          if (options.focus !== undefined) options.focus();
          else element.focus();
          // The focus ring shows: focus moved for a reason the user did not
          // ask for, so they have to be able to see where it went.
          setInteractionModality("keyboard");
        }
      }

      // The browser's own bubble is suppressed; the message is in the page.
      event.preventDefault();
    };

    const onChange = (): void => state.commitValidation();
    const onReset = (): void => state.resetValidation();

    element.addEventListener("invalid", onInvalid);
    element.addEventListener("change", onChange);
    element.form?.addEventListener("reset", onReset);

    return () => {
      element.removeEventListener("invalid", onInvalid);
      element.removeEventListener("change", onChange);
      element.form?.removeEventListener("reset", onReset);
    };
  });
}
