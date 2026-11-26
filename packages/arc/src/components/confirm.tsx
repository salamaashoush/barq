import {
  type Child,
  For,
  Match,
  Show,
  Switch,
  createSignal,
  createUniqueId,
  onCleanup,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@barqjs/ui/alert-dialog";
import { Button } from "@barqjs/ui/button";
import { Checkbox } from "@barqjs/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";
import { Label } from "@barqjs/ui/label";
import { NativeSelect, NativeSelectOption } from "@barqjs/ui/native-select";
import { Skeleton } from "@barqjs/ui/skeleton";
import { Textarea } from "@barqjs/ui/textarea";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, plainList, space, type } from "../style/index.ts";
import { InlineAlert } from "./alert.tsx";
import { useArcMessages } from "./messages.ts";
import { Sentence } from "./sentence.tsx";
import { serverMessage } from "./server-message.ts";
import { Link } from "./text-link.tsx";

/** The parts of the dialog `confirm()` draws, for `classes` on the host. */
export const confirmStyles = variants({
  slots: {
    root: arc({}),
    header: arc({}),
    title: arc({}),
    description: arc({}),
    form: arc({ display: "contents" }),
    body: arc(layout.column, layout.minZero, gap[4], type.sm),
    field: arc({}),
    option: arc(layout.row, gap[2], { alignItems: "center" }),
    typed: arc(type.mono, type.medium),
    loading: arc(layout.column, gap[2]),
    barLong: arc({ height: space.x4, width: "75%" }),
    barShort: arc({ height: space.x4, width: "50%" }),
    list: arc(plainList, layout.column, gap[1.5]),
    item: arc(layout.column, layout.minZero),
    more: arc(fg.muted),
    footer: arc({}),
    cancel: arc({}),
    action: arc({}),
  },
});

type Slots = ReturnType<typeof confirmStyles>;

export type ConfirmHostProps = Customisable<Slots>;

/** A box to tick that goes with the answer: "Also delete its runs". */
export interface ConfirmCheckboxField {
  kind: "checkbox";
  label: Child;
  /** @default false */
  defaultValue?: boolean;
}

export interface ConfirmChoice {
  value: string;
  label: string;
}

/** A choice to make before answering: where the holders of a deleted role move. */
export interface ConfirmSelectField {
  kind: "select";
  label: Child;
  options: readonly ConfirmChoice[];
  /** Left out, nothing is chosen and the confirming button waits for a choice. */
  defaultValue?: string;
  description?: Child;
}

/** Words to give before answering: the reason for an audited change. */
export interface ConfirmTextField {
  kind: "text";
  label: Child;
  /** A text area rather than one line. */
  multiline?: boolean;
  placeholder?: string;
  defaultValue?: string;
  /** Answered without any words at all. @default false, so the button waits for some */
  optional?: boolean;
  maxLength?: number;
  description?: Child;
}

export type ConfirmField = ConfirmCheckboxField | ConfirmSelectField | ConfirmTextField;

/** What a field answers with: a box ticked or not, the choice, the words. */
export type ConfirmFieldValue<F extends ConfirmField> = F extends ConfirmCheckboxField
  ? boolean
  : string;

/** Something that depends on what is about to go. */
export interface Dependent {
  id: string;
  label: Child;
  /** Where to go to change it, so a blocker can be dealt with. */
  href?: string;
  description?: Child;
}

/**
 * What depends on the thing, as `dependents` loads it: blockers refuse the
 * action outright, while affected items are named in the question.
 */
export interface DependentsCheck {
  /** While any are left the action is refused, each listed with its link. */
  blockers?: readonly Dependent[];
  /** How many blockers there are in all, when the list holds only the first. */
  blockerCount?: number;
  /** What goes with it, moves or falls back once it is done. */
  affected?: readonly Dependent[];
  affectedCount?: number;
  /** One line on what the affected read instead: "They use the project's default." */
  fallback?: Child;
  /** Why it is refused, in place of the default words. */
  reason?: Child;
  /** Every dependent, for a list cut short. */
  allHref?: string;
}

interface ConfirmBase {
  title: Child;
  description?: Child;
  /** @default "Continue" */
  confirmLabel?: Child;
  /** @default "Cancel" */
  cancelLabel?: Child;
  /** `danger` draws the confirming button as destructive. */
  tone?: "default" | "danger";
  /**
   * More than a description holds, between it and the buttons: what is
   * lost, counted. Called inside the dialog, so it may read and wait.
   */
  details?: () => Child;
  /**
   * Text the reader types before the confirming button works: the
   * resource's name, for what cannot be undone.
   */
  typeToConfirm?: string;
  /**
   * What depends on the thing, loaded as the dialog opens. Blockers refuse
   * the action with a list of what to fix first; otherwise the affected are
   * listed in the question.
   */
  dependents?: () => Promise<DependentsCheck>;
  /** The title while blockers refuse the action. @default the provider's `blockedTitle` */
  blockedTitle?: Child;
}

export interface ConfirmOptions extends ConfirmBase {
  /**
   * Run once confirmed, with the dialog open and its buttons pending; a
   * failure is shown inside it and the question stays. `confirm()` resolves
   * only after this succeeded.
   */
  action?: () => unknown;
}

export interface ConfirmFieldOptions<F extends ConfirmField> extends ConfirmBase {
  field: F;
  /** As `ConfirmOptions.action`, handed the field's value. */
  action?: (value: ConfirmFieldValue<F>) => unknown;
}

/** A confirmation with a field: the value it was answered with. */
export interface ConfirmAnswer<T> {
  value: T;
}

type Value = boolean | string;

interface Asked {
  readonly title: Child;
  readonly description: Child | undefined;
  readonly confirmLabel: Child | undefined;
  readonly cancelLabel: Child | undefined;
  readonly tone: "default" | "danger";
  readonly details: (() => Child) | undefined;
  readonly typeToConfirm: string | undefined;
  readonly dependents: (() => Promise<DependentsCheck>) | undefined;
  readonly blockedTitle: Child | undefined;
  readonly field: ConfirmField | undefined;
  readonly action: ((value: Value) => unknown) | undefined;
  /** Held while the action runs, when nothing may dismiss the dialog. */
  busy: boolean;
  settle: (answer: ConfirmAnswer<Value> | null) => void;
}

const [asked, setAsked] = createSignal<Asked | null>(null);
const [isOpen, setOpen] = createSignal(false);

function ask(options: ConfirmBase, field: ConfirmField | undefined, action: unknown) {
  return new Promise<ConfirmAnswer<Value> | null>((resolve) => {
    let settled = false;
    function settle(answer: ConfirmAnswer<Value> | null): void {
      if (settled) return;
      settled = true;
      resolve(answer);
    }
    const question: Asked = {
      title: options.title,
      description: options.description,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      tone: options.tone ?? "default",
      details: options.details,
      typeToConfirm: options.typeToConfirm,
      dependents: options.dependents,
      blockedTitle: options.blockedTitle,
      field,
      action: action as ((value: Value) => unknown) | undefined,
      busy: false,
      settle,
    };
    setAsked((previous) => {
      previous?.settle(null);
      return question;
    });
    setOpen(true);
  });
}

/**
 * Ask, and wait for the answer.
 *
 * Resolves `true` when the reader confirms and `false` when they cancel. A
 * second question while one is open answers the first `false`: two stacked
 * confirmations are a bug in the flow that asked, not something to queue.
 * Needs a `<ConfirmHost />` on the page, which `<ArcProvider>` renders.
 *
 * ```ts
 * if (await confirm({ title: "Delete the check?", tone: "danger", confirmLabel: "Delete" })) {
 *   await remove(id);
 * }
 * ```
 *
 * With a `field` it resolves `{ value }` on confirming and `null` on
 * cancelling: a box ticked or not, a choice, or words such as the reason
 * for a change.
 *
 * ```ts
 * const answer = await confirm({
 *   title: "Delete the location?",
 *   tone: "danger",
 *   field: { kind: "checkbox", label: "Also delete its runners" },
 * });
 * if (answer !== null) await remove(id, { runners: answer.value });
 * ```
 *
 * `typeToConfirm` waits for a name to be typed, `details` adds what is lost,
 * `dependents` loads what depends on the thing and refuses while anything
 * blocks it, and `action` runs inside the dialog, which stays open with its
 * failure until it succeeds.
 */
export function confirm<F extends ConfirmField>(
  options: ConfirmFieldOptions<F>,
): Promise<ConfirmAnswer<ConfirmFieldValue<F>> | null>;
export function confirm(options: ConfirmOptions): Promise<boolean>;
export function confirm(
  options: ConfirmOptions | ConfirmFieldOptions<ConfirmField>,
): Promise<boolean | ConfirmAnswer<Value> | null> {
  if ("field" in options) return ask(options, options.field, options.action);
  return ask(options, undefined, options.action).then((answer) => answer !== null);
}

function initial(field: ConfirmField | undefined): Value {
  if (field === undefined) return true;
  if (field.kind === "checkbox") return field.defaultValue ?? false;
  return field.defaultValue ?? "";
}

type Check =
  | { readonly state: "none" }
  | { readonly state: "loading" }
  | { readonly state: "failed"; readonly message: string }
  | { readonly state: "loaded"; readonly result: DependentsCheck };

function blocked(check: Check): boolean {
  return check.state === "loaded" && (check.result.blockers?.length ?? 0) > 0;
}

interface QuestionProps {
  question: Asked;
  cls: Slots;
  finish: (answer: ConfirmAnswer<Value> | null) => void;
}

interface DependentListProps {
  items: readonly Dependent[];
  total: number | undefined;
  allHref: string | undefined;
  cls: Slots;
}

function DependentList(props: DependentListProps) {
  const messages = useArcMessages();
  function rest(): number {
    return Math.max(0, (props.total ?? props.items.length) - props.items.length);
  }
  return (
    <>
      <ul class={props.cls.list} data-slot="confirm-dependents">
        <For each={props.items}>
          {(item: Dependent) => (
            <li class={props.cls.item} data-slot="confirm-dependent">
              <Show when={item.href !== undefined} fallback={<span>{item.label}</span>}>
                <Link href={item.href}>{item.label}</Link>
              </Show>
              <Show when={item.description !== undefined}>
                <span class={props.cls.more}>{item.description}</span>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={rest() > 0 || props.allHref !== undefined}>
        <p class={props.cls.more} data-slot="confirm-dependents-more">
          <Show when={rest() > 0}>{messages().andMore(rest())} </Show>
          <Show when={props.allHref !== undefined}>
            <Link href={props.allHref}>
              {messages().showAll(props.total ?? props.items.length)}
            </Link>
          </Show>
        </p>
      </Show>
    </>
  );
}

function Question(props: QuestionProps) {
  const messages = useArcMessages();
  const question = props.question;
  const fieldId = createUniqueId();
  const hintId = createUniqueId();
  const [value, setValue] = createSignal<Value>(initial(question.field));
  const [typed, setTyped] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string | undefined>(undefined);
  const [check, setCheck] = createSignal<Check>(
    question.dependents === undefined ? { state: "none" } : { state: "loading" },
  );

  async function load(): Promise<void> {
    const dependents = question.dependents;
    if (dependents === undefined) return;
    try {
      setCheck({ state: "loaded", result: await dependents() });
    } catch (error) {
      setCheck({
        state: "failed",
        message: serverMessage(error, messages().dependentsFailed),
      });
    }
  }
  void load();

  function filled(): boolean {
    const field = question.field;
    if (field === undefined || field.kind === "checkbox") return true;
    if (field.kind === "text" && field.optional === true) return true;
    return String(value()).trim() !== "";
  }
  function ready(): boolean {
    if (busy() || !filled()) return false;
    if (question.typeToConfirm !== undefined && typed() !== question.typeToConfirm) return false;
    const state = check();
    return state.state === "none" || (state.state === "loaded" && !blocked(state));
  }

  async function accept(): Promise<void> {
    if (!ready()) return;
    const answer = value();
    const action = question.action;
    if (action !== undefined) {
      question.busy = true;
      setBusy(true);
      setFailure(undefined);
      try {
        await action(answer);
      } catch (error) {
        setFailure(serverMessage(error, messages().somethingWentWrong));
        return;
      } finally {
        question.busy = false;
        setBusy(false);
      }
    }
    props.finish({ value: answer });
  }

  function hasBody(): boolean {
    return (
      question.details !== undefined ||
      question.field !== undefined ||
      question.typeToConfirm !== undefined ||
      question.dependents !== undefined ||
      failure() !== undefined
    );
  }

  function failedCheck(): string | undefined {
    const state = check();
    return state.state === "failed" ? state.message : undefined;
  }
  function result(): DependentsCheck | undefined {
    const state = check();
    return state.state === "loaded" ? state.result : undefined;
  }

  return (
    <>
      <AlertDialogHeader class={props.cls.header}>
        <AlertDialogTitle class={props.cls.title}>
          {blocked(check()) ? (question.blockedTitle ?? messages().blockedTitle) : question.title}
        </AlertDialogTitle>
        <Show when={blocked(check()) || question.description !== undefined}>
          <AlertDialogDescription class={props.cls.description}>
            {blocked(check())
              ? (result()?.reason ?? messages().blockedDescription)
              : question.description}
          </AlertDialogDescription>
        </Show>
      </AlertDialogHeader>
      <form
        class={props.cls.form}
        data-slot="confirm-form"
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          void accept();
        }}
      >
        <Show when={hasBody()}>
          <div class={props.cls.body} data-slot="confirm-body">
            <Switch>
              <Match when={check().state === "loading"}>
                <div
                  class={props.cls.loading}
                  data-slot="confirm-checking"
                  role="status"
                  aria-busy="true"
                >
                  <span>{messages().checkingDependents}</span>
                  <Skeleton class={props.cls.barLong} />
                  <Skeleton class={props.cls.barShort} />
                </div>
              </Match>
              <Match when={check().state === "failed"}>
                <InlineAlert
                  tone="danger"
                  title={messages().dependentsFailed}
                  actions={
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => {
                        setCheck({ state: "loading" });
                        void load();
                      }}
                    >
                      {messages().retry}
                    </Button>
                  }
                >
                  {failedCheck()}
                </InlineAlert>
              </Match>
              <Match when={blocked(check())}>
                <DependentList
                  items={result()?.blockers ?? []}
                  total={result()?.blockerCount}
                  allHref={result()?.allHref}
                  cls={props.cls}
                />
              </Match>
              <Match when={(result()?.affected?.length ?? 0) > 0}>
                <p data-slot="confirm-affected">
                  {messages().dependsOnIt(
                    result()?.affectedCount ?? result()?.affected?.length ?? 0,
                  )}
                </p>
                <DependentList
                  items={result()?.affected ?? []}
                  total={result()?.affectedCount}
                  allHref={result()?.allHref}
                  cls={props.cls}
                />
                <Show when={result()?.fallback !== undefined}>
                  <p data-slot="confirm-fallback">{result()?.fallback}</p>
                </Show>
              </Match>
            </Switch>
            <Show when={!blocked(check()) && question.details !== undefined}>
              {question.details?.()}
            </Show>
            <Show when={failure() !== undefined}>
              <InlineAlert tone="danger" title={messages().actionFailed}>
                {failure()}
              </InlineAlert>
            </Show>
            <Show when={!blocked(check()) && question.field !== undefined}>
              <FieldFor
                field={question.field as ConfirmField}
                id={fieldId}
                hintId={hintId}
                value={value()}
                onChange={setValue}
                disabled={busy()}
                cls={props.cls}
              />
            </Show>
            <Show when={!blocked(check()) && question.typeToConfirm !== undefined}>
              <Field class={props.cls.field} data-slot="confirm-type">
                <FieldLabel for={`${fieldId}-typed`}>
                  <Sentence words={messages().typeToConfirm}>
                    <span class={props.cls.typed} data-slot="confirm-typed" translate="no">
                      {question.typeToConfirm}
                    </span>
                  </Sentence>
                </FieldLabel>
                <Input
                  id={`${fieldId}-typed`}
                  value={typed()}
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  disabled={busy()}
                  onInput={(event: Event) => setTyped((event.target as HTMLInputElement).value)}
                />
              </Field>
            </Show>
          </div>
        </Show>
        <AlertDialogFooter class={props.cls.footer}>
          <Show
            when={!blocked(check())}
            fallback={
              <Button
                class={props.cls.cancel}
                data-slot="alert-dialog-cancel"
                variant="outline"
                onPress={() => props.finish(null)}
              >
                {messages().close}
              </Button>
            }
          >
            <Button
              class={props.cls.cancel}
              data-slot="alert-dialog-cancel"
              variant="outline"
              isDisabled={busy()}
              onPress={() => props.finish(null)}
            >
              {question.cancelLabel ?? messages().cancel}
            </Button>
            <Button
              class={props.cls.action}
              data-slot="alert-dialog-action"
              type="submit"
              variant={question.tone === "danger" ? "destructive" : "default"}
              isDisabled={!ready() && !busy()}
              isPending={busy()}
            >
              {question.confirmLabel ?? messages().continue}
            </Button>
          </Show>
        </AlertDialogFooter>
      </form>
    </>
  );
}

interface FieldForProps {
  field: ConfirmField;
  id: string;
  hintId: string;
  value: Value;
  onChange: (value: Value) => void;
  disabled: boolean;
  cls: Slots;
}

function FieldFor(props: FieldForProps) {
  const messages = useArcMessages();
  function hint(): Child | undefined {
    const field = props.field;
    return field.kind === "checkbox" ? undefined : field.description;
  }
  return (
    <Switch>
      <Match when={props.field.kind === "checkbox"}>
        <div class={props.cls.option} data-slot="confirm-field">
          <Checkbox
            id={props.id}
            checked={props.value === true}
            disabled={props.disabled}
            onCheckedChange={(checked: boolean) => props.onChange(checked)}
          />
          <Label for={props.id}>{props.field.label}</Label>
        </div>
      </Match>
      <Match when={props.field.kind === "select"}>
        <Field class={props.cls.field} data-slot="confirm-field">
          <FieldLabel for={props.id}>{props.field.label}</FieldLabel>
          <NativeSelect
            id={props.id}
            value={String(props.value)}
            required
            disabled={props.disabled}
            aria-describedby={hint() === undefined ? undefined : props.hintId}
            onChange={(event: Event) => props.onChange((event.target as HTMLSelectElement).value)}
          >
            <NativeSelectOption value="" disabled>
              {messages().selectPlaceholder}
            </NativeSelectOption>
            <For each={(props.field as ConfirmSelectField).options}>
              {(option: ConfirmChoice) => (
                <NativeSelectOption value={option.value}>{option.label}</NativeSelectOption>
              )}
            </For>
          </NativeSelect>
          <Show when={hint() !== undefined}>
            <FieldDescription id={props.hintId}>{hint()}</FieldDescription>
          </Show>
        </Field>
      </Match>
      <Match when={props.field.kind === "text"}>
        <Field class={props.cls.field} data-slot="confirm-field">
          <FieldLabel for={props.id}>{props.field.label}</FieldLabel>
          <Show
            when={(props.field as ConfirmTextField).multiline === true}
            fallback={
              <Input
                id={props.id}
                value={String(props.value)}
                placeholder={(props.field as ConfirmTextField).placeholder}
                maxLength={(props.field as ConfirmTextField).maxLength}
                required={(props.field as ConfirmTextField).optional !== true}
                disabled={props.disabled}
                aria-describedby={hint() === undefined ? undefined : props.hintId}
                onInput={(event: Event) => props.onChange((event.target as HTMLInputElement).value)}
              />
            }
          >
            <Textarea
              id={props.id}
              value={String(props.value)}
              rows={3}
              placeholder={(props.field as ConfirmTextField).placeholder}
              maxLength={(props.field as ConfirmTextField).maxLength}
              required={(props.field as ConfirmTextField).optional !== true}
              disabled={props.disabled}
              aria-describedby={hint() === undefined ? undefined : props.hintId}
              onInput={(event: Event) =>
                props.onChange((event.target as HTMLTextAreaElement).value)
              }
            />
          </Show>
          <Show when={hint() !== undefined}>
            <FieldDescription id={props.hintId}>{hint()}</FieldDescription>
          </Show>
        </Field>
      </Match>
    </Switch>
  );
}

/** Where `confirm()` draws its dialog. One per page. */
export function ConfirmHost(props: ConfirmHostProps) {
  function cls(): Slots {
    return parts(confirmStyles(), props.classes);
  }
  function finish(answer: ConfirmAnswer<Value> | null): void {
    const question = asked();
    if (question === null) return;
    question.settle(answer);
    setOpen(false);
  }
  // A host leaving the page answers what it was asking, so nothing waits on
  // a question no one can see.
  onCleanup(() => {
    asked()?.settle(null);
    if (isOpen()) setOpen(false);
  });
  return (
    <AlertDialog
      isOpen={isOpen()}
      onOpenChange={(next: boolean) => {
        if (next || asked()?.busy === true) return;
        finish(null);
      }}
    >
      <AlertDialogContent class={arc(cls().root, props.class, props.className)}>
        <Show when={asked()} keyed>
          {(question: Asked) => <Question question={question} cls={cls()} finish={finish} />}
        </Show>
      </AlertDialogContent>
    </AlertDialog>
  );
}
