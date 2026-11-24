import { type Child, For, Show, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { AnyFormApi } from "@barqjs/form";
import { Check } from "@barqjs/lucide/icons/check";
import { Download } from "@barqjs/lucide/icons/download";
import { KeyRound } from "@barqjs/lucide/icons/key-round";
import { MailCheck } from "@barqjs/lucide/icons/mail-check";
import { X } from "@barqjs/lucide/icons/x";
import { Button } from "@barqjs/ui/button";
import { Checkbox } from "@barqjs/ui/checkbox";
import { on } from "@barqjs/ui/conditions";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@barqjs/ui/input-otp";
import { Label } from "@barqjs/ui/label";
import { Progress } from "@barqjs/ui/progress";
import { Separator } from "@barqjs/ui/separator";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  fg,
  gap,
  glyph,
  layout,
  plainList,
  rounded,
  space,
  surface,
  tone,
  type,
} from "../style/index.ts";
import { InlineAlert } from "./alert.tsx";
import { CopyButton } from "./copy-button.tsx";
import { type ServerErrors, setServerErrors, useArcForm } from "./form.tsx";
import { useArcMessages } from "./messages.ts";

export const authStyles = variants({
  slots: {
    root: arc(layout.minZero, bg.page, {
      display: "grid",
      minHeight: "100dvh",
      gridTemplateColumns: { default: "1fr", [on.lg]: "minmax(0, 1fr) minmax(0, 1fr)" },
    }),
    main: arc(layout.column, layout.centre, gap[8], {
      padding: { default: space.x6, [on.sm]: space.x10 },
    }),
    brand: arc(layout.row, gap[2], type.subheading),
    content: arc(layout.column, layout.fill, gap[6], { maxWidth: "24rem" }),
    aside: arc(layout.column, layout.relative, bg.muted, {
      display: { default: "none", [on.lg]: "flex" },
      overflow: "hidden",
    }),
    footer: arc(type.meta, layout.row, layout.wrap, gap[4]),
    form: arc(layout.column, gap[4]),
    header: arc(layout.column, gap[1.5]),
    heading: arc(type.title),
    description: arc(type.body, fg.muted),
    providers: arc(layout.column, gap[2]),
    divider: arc(layout.row, gap[3], type.meta),
    links: arc(layout.row, layout.between, layout.wrap, gap[2], type.sm),
    rules: arc(plainList, layout.column, gap[1], type.caption, glyph.sm),
    rule: arc(layout.row, gap[1.5], fg.muted),
    strength: arc(layout.column, gap[1]),
    sent: arc(layout.column, layout.centre, gap[3], { textAlign: "center" }),
    sentIcon: arc(layout.centre, tone.success, bg.tone, fg.tone, glyph.md, rounded.full, {
      width: space.x12,
      height: space.x12,
    }),
    codes: arc(plainList, type.mono, type.numeric, surface.sunken, rounded.md, gap[2], {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))",
      padding: space.x4,
    }),
    actions: arc(layout.row, layout.wrap, gap[2]),
    otp: arc(layout.column, gap[2], layout.centre),
    confirm: arc(layout.row, gap[2], type.sm),
  },
  variants: {
    met: { true: { rule: arc(tone.success, fg.tone) }, false: {} },
    width: {
      narrow: {},
      wide: { content: arc({ maxWidth: "36rem" }) },
    },
  },
  defaults: { width: "narrow" },
});

type Slots = ReturnType<typeof authStyles>;

type Answer = ServerErrors | void | undefined;

/** Put what a failed submission returned on the fields it names and the rest on the form. */
async function settleAnswer(form: AnyFormApi, answer: Answer | Promise<Answer>): Promise<boolean> {
  const errors = await answer;
  if (errors === undefined || (errors.form === undefined && errors.fields === undefined)) {
    return true;
  }
  setServerErrors(form, errors);
  return false;
}

// --- the layout ----------------------------------------------------------------

export interface AuthLayoutProps extends Customisable<Slots> {
  /** The product's mark and name, above the form. */
  brand?: Child;
  /** The other half on a wide screen: an illustration, a showcase, a quote. Hidden on a narrow one. */
  aside?: Child;
  /** Under the form: legal links, a language picker. */
  footer?: Child;
  /** `wide` for a consent screen or a long flow. @default "narrow" */
  width?: "narrow" | "wide";
  children?: Child;
}

/**
 * The page every signed-out screen sits on: the brand above a column holding
 * the form, and an `aside` beside it on a wide screen.
 */
export function AuthLayout(props: AuthLayoutProps) {
  const cls = (): Slots => parts(authStyles({ width: props.width }), props.classes);
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="auth-layout">
      <main class={cls().main} data-slot="auth-layout-main">
        <div class={cls().content} data-slot="auth-layout-content">
          <Show when={props.brand !== undefined}>
            <div class={cls().brand} data-slot="auth-layout-brand">
              {props.brand}
            </div>
          </Show>
          {props.children}
          <Show when={props.footer !== undefined}>
            <footer class={cls().footer} data-slot="auth-layout-footer">
              {props.footer}
            </footer>
          </Show>
        </div>
      </main>
      <Show when={props.aside !== undefined}>
        <aside class={cls().aside} data-slot="auth-layout-aside">
          {props.aside}
        </aside>
      </Show>
    </div>
  );
}

// --- shared parts ----------------------------------------------------------------

function Header(props: { heading: Child; description?: Child; classes: Slots }) {
  return (
    <header class={props.classes.header} data-slot="auth-header">
      <h1 class={props.classes.heading} data-slot="auth-heading">
        {props.heading}
      </h1>
      <Show when={props.description !== undefined}>
        <p class={props.classes.description} data-slot="auth-description">
          {props.description}
        </p>
      </Show>
    </header>
  );
}

function Providers(props: { children?: Child; classes: Slots }) {
  const messages = useArcMessages();
  return (
    <Show when={props.children !== undefined}>
      <div class={props.classes.providers} data-slot="auth-providers">
        {props.children}
      </div>
      <div class={props.classes.divider} data-slot="auth-divider" role="presentation">
        <Separator class={layout.grow} />
        <span>{messages().or}</span>
        <Separator class={layout.grow} />
      </div>
    </Show>
  );
}

function Sent(props: { heading: Child; description: Child; classes: Slots; children?: Child }) {
  return (
    <div class={props.classes.sent} data-slot="auth-sent" role="status">
      <span class={props.classes.sentIcon} aria-hidden="true">
        <MailCheck />
      </span>
      <h1 class={props.classes.heading}>{props.heading}</h1>
      <p class={props.classes.description}>{props.description}</p>
      {props.children}
    </div>
  );
}

export interface PasswordRule {
  label: string;
  test: (password: string) => boolean;
}

/** What a new password must have; at least eight characters, a letter and a digit. */
export function defaultPasswordRules(messages: {
  passwordLength: (count: number) => string;
  passwordLetter: string;
  passwordDigit: string;
}): PasswordRule[] {
  return [
    { label: messages.passwordLength(8), test: (value) => value.length >= 8 },
    { label: messages.passwordLetter, test: (value) => /\p{L}/u.test(value) },
    { label: messages.passwordDigit, test: (value) => /\p{Nd}/u.test(value) },
  ];
}

/** How strong a password is, from 0 to 4: its length and how many kinds of character it mixes. */
export function passwordStrength(password: string): number {
  if (password === "") return 0;
  const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((kind) =>
    kind.test(password),
  ).length;
  const length = password.length >= 14 ? 2 : password.length >= 8 ? 1 : 0;
  return Math.max(1, Math.min(4, length + kinds - 1));
}

export interface PasswordStrengthProps extends Customisable<Slots> {
  password: string;
  rules?: readonly PasswordRule[];
}

/** A new password's rules, each ticked as it is met, and a meter of how strong it is. */
export function PasswordStrength(props: PasswordStrengthProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(authStyles(), props.classes);
  const rules = (): readonly PasswordRule[] => props.rules ?? defaultPasswordRules(messages());
  const score = (): number => passwordStrength(props.password);
  const words = (): string[] => [
    messages().strengthNone,
    messages().strengthWeak,
    messages().strengthFair,
    messages().strengthGood,
    messages().strengthStrong,
  ];
  return (
    <div class={arc(cls().strength, props.class, props.className)} data-slot="password-strength">
      <Progress
        value={score()}
        maxValue={4}
        aria-label={messages().passwordStrength}
        getValueLabel={(value: number) => words()[value] ?? ""}
      />
      <ul class={cls().rules} data-slot="password-rules" aria-label={messages().passwordRules}>
        <For each={rules()}>
          {(rule: PasswordRule) => (
            <li
              class={arc(authStyles({ met: rule.test(props.password) }).rule, props.classes?.rule)}
              data-slot="password-rule"
              data-met={rule.test(props.password) ? "" : undefined}
            >
              {rule.test(props.password) ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
              <span>{rule.label}</span>
              <span class={srOnly}>
                {rule.test(props.password) ? messages().met : messages().notMet}
              </span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

// --- sign in -------------------------------------------------------------------

export interface SignInValues {
  email: string;
  password: string;
  remember: boolean;
}

export interface SignInFormProps extends Customisable<Slots> {
  /** Answers with what was wrong, if anything; the form shows it. */
  onSubmit: (values: SignInValues) => Answer | Promise<Answer>;
  /** @default arc's "Sign in" */
  heading?: Child;
  description?: Child;
  /** The provider buttons, above the form with "or" between. */
  providers?: Child;
  /** A "Remember me" checkbox. @default true */
  remember?: boolean;
  /** A "Forgot password?" link. */
  forgotHref?: string;
  /** Adds "Email me a link", which sends a sign-in link to the address typed. */
  onMagicLink?: (email: string) => void | Promise<unknown>;
  /** Adds "Sign in with a passkey"; the WebAuthn call is the app's. */
  onPasskey?: () => void | Promise<unknown>;
  /** Under the form: "No account? Sign up". */
  footer?: Child;
  defaultEmail?: string;
}

/**
 * Sign in with an email and a password, and whatever else the product
 * offers: provider buttons, a magic link, a passkey, "Remember me" and a
 * link to reset the password.
 */
export function SignInForm(props: SignInFormProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(authStyles(), props.classes);
  const [mode, setMode] = createSignal<"password" | "link" | "sent">("password");
  const [failure, setFailure] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const form = useArcForm(() => ({
    defaultValues: {
      email: untrack(() => props.defaultEmail) ?? "",
      password: "",
      remember: false,
    },
    onSubmit: async ({ value, formApi }) => {
      setFailure(null);
      if (mode() === "link") {
        const outcome = props.onMagicLink?.(value.email);
        try {
          await outcome;
          setMode("sent");
        } catch {
          setFailure(messages().linkFailed);
        }
        return;
      }
      await settleAnswer(formApi, props.onSubmit(value));
    },
  }));
  const passkey = async (): Promise<void> => {
    setFailure(null);
    setBusy(true);
    try {
      await props.onPasskey?.();
    } catch {
      setFailure(messages().passkeyFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class={arc(cls().form, props.class, props.className)} data-slot="sign-in-form">
      <Show
        when={mode() !== "sent"}
        fallback={
          <Sent
            heading={messages().checkInbox}
            description={messages().linkSent(form.state.values.email)}
            classes={cls()}
          >
            <Button variant="ghost" onPress={() => setMode("password")}>
              {messages().back}
            </Button>
          </Sent>
        }
      >
        <Header
          heading={props.heading ?? messages().signIn}
          description={props.description}
          classes={cls()}
        />
        <Providers classes={cls()}>{props.providers}</Providers>
        <form.AppForm>
          <form
            class={cls().form}
            noValidate
            aria-label={messages().signIn}
            onSubmit={(event: Event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.FormError />
            <Show when={failure() !== null}>
              <InlineAlert tone="danger">{failure()}</InlineAlert>
            </Show>
            <form.AppField
              name="email"
              validators={{
                onSubmit: ({ value }: { value: string }) =>
                  value.includes("@") ? undefined : messages().emailInvalid,
              }}
            >
              {(field) => (
                <field.TextField
                  label={messages().email}
                  type="email"
                  autoComplete="username webauthn"
                  isRequired
                />
              )}
            </form.AppField>
            <Show when={mode() === "password"}>
              <form.AppField
                name="password"
                validators={{
                  onSubmit: ({ value }: { value: string }) =>
                    value === "" ? messages().passwordRequired : undefined,
                }}
              >
                {(field) => (
                  <field.PasswordField
                    label={messages().password}
                    autoComplete="current-password"
                  />
                )}
              </form.AppField>
              <Show when={props.remember !== false || props.forgotHref !== undefined}>
                <div class={cls().links} data-slot="auth-links">
                  <Show when={props.remember !== false}>
                    <form.AppField name="remember">
                      {(field) => <field.CheckboxField label={messages().rememberMe} />}
                    </form.AppField>
                  </Show>
                  <Show when={props.forgotHref !== undefined}>
                    <a href={props.forgotHref} class={fg.link} data-slot="auth-forgot">
                      {messages().forgotPassword}
                    </a>
                  </Show>
                </div>
              </Show>
            </Show>
            <form.SubmitButton>
              {mode() === "link" ? messages().sendLink : messages().signIn}
            </form.SubmitButton>
          </form>
        </form.AppForm>
        <Show when={props.onMagicLink !== undefined || props.onPasskey !== undefined}>
          <div class={cls().actions} data-slot="auth-alternatives">
            <Show when={props.onMagicLink !== undefined}>
              <Button
                variant="outline"
                class={layout.grow}
                onPress={() => setMode(mode() === "link" ? "password" : "link")}
              >
                {mode() === "link" ? messages().usePassword : messages().emailMeLink}
              </Button>
            </Show>
            <Show when={props.onPasskey !== undefined}>
              <Button
                variant="outline"
                class={layout.grow}
                isPending={busy()}
                onPress={() => void passkey()}
              >
                <KeyRound aria-hidden="true" />
                {messages().signInWithPasskey}
              </Button>
            </Show>
          </div>
        </Show>
        <Show when={props.footer !== undefined}>
          <div class={cls().description}>{props.footer}</div>
        </Show>
      </Show>
    </section>
  );
}

// --- sign up -------------------------------------------------------------------

export interface SignUpValues {
  name: string;
  email: string;
  password: string;
}

export interface SignUpFormProps extends Customisable<Slots> {
  onSubmit: (values: SignUpValues) => Answer | Promise<Answer>;
  heading?: Child;
  description?: Child;
  providers?: Child;
  /** Ask for a name. @default true */
  name?: boolean;
  /** Words the reader agrees to with a checkbox before signing up: links to terms. */
  terms?: Child;
  rules?: readonly PasswordRule[];
  /** After a sign-up, say an email was sent to confirm the address. @default false */
  verifyEmail?: boolean;
  footer?: Child;
}

/** A new account: a name, an email, a password held to its rules with a confirmation, and terms. */
export function SignUpForm(props: SignUpFormProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(authStyles(), props.classes);
  const [sent, setSent] = createSignal<string | null>(null);
  const rules = (): readonly PasswordRule[] => props.rules ?? defaultPasswordRules(messages());
  const form = useArcForm(() => ({
    defaultValues: { name: "", email: "", password: "", confirm: "", terms: false },
    onSubmit: async ({ value, formApi }) => {
      const done = await settleAnswer(
        formApi,
        props.onSubmit({ name: value.name, email: value.email, password: value.password }),
      );
      if (done && props.verifyEmail === true) setSent(value.email);
    },
  }));
  return (
    <section class={arc(cls().form, props.class, props.className)} data-slot="sign-up-form">
      <Show
        when={sent() === null}
        fallback={
          <Sent
            heading={messages().checkInbox}
            description={messages().confirmSent(sent() ?? "")}
            classes={cls()}
          />
        }
      >
        <Header
          heading={props.heading ?? messages().signUp}
          description={props.description}
          classes={cls()}
        />
        <Providers classes={cls()}>{props.providers}</Providers>
        <form.AppForm>
          <form
            class={cls().form}
            noValidate
            aria-label={messages().signUp}
            onSubmit={(event: Event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.FormError />
            <Show when={props.name !== false}>
              <form.AppField
                name="name"
                validators={{
                  onSubmit: ({ value }: { value: string }) =>
                    value.trim() === "" ? messages().nameRequired : undefined,
                }}
              >
                {(field) => <field.TextField label={messages().fullName} autoComplete="name" />}
              </form.AppField>
            </Show>
            <form.AppField
              name="email"
              validators={{
                onSubmit: ({ value }: { value: string }) =>
                  value.includes("@") ? undefined : messages().emailInvalid,
              }}
            >
              {(field) => (
                <field.TextField label={messages().email} type="email" autoComplete="email" />
              )}
            </form.AppField>
            <form.AppField
              name="password"
              validators={{
                onSubmit: ({ value }: { value: string }) =>
                  rules().every((rule) => rule.test(value)) ? undefined : messages().passwordWeak,
              }}
            >
              {(field) => (
                <>
                  <field.PasswordField label={messages().password} autoComplete="new-password" />
                  <PasswordStrength
                    password={field().state.value}
                    rules={rules()}
                    classes={props.classes}
                  />
                </>
              )}
            </form.AppField>
            <form.AppField
              name="confirm"
              validators={{
                onChangeListenTo: ["password"],
                onSubmit: ({
                  value,
                  fieldApi,
                }: {
                  value: string;
                  fieldApi: { form: AnyFormApi };
                }) =>
                  value === fieldApi.form.state.values.password
                    ? undefined
                    : messages().passwordsDiffer,
              }}
            >
              {(field) => (
                <field.PasswordField
                  label={messages().confirmPassword}
                  autoComplete="new-password"
                />
              )}
            </form.AppField>
            <Show when={props.terms !== undefined}>
              <form.AppField
                name="terms"
                validators={{
                  onSubmit: ({ value }: { value: boolean }) =>
                    value ? undefined : messages().termsRequired,
                }}
              >
                {(field) => <field.CheckboxField label={props.terms} />}
              </form.AppField>
            </Show>
            <form.SubmitButton>{messages().signUp}</form.SubmitButton>
          </form>
        </form.AppForm>
        <Show when={props.footer !== undefined}>
          <div class={cls().description}>{props.footer}</div>
        </Show>
      </Show>
    </section>
  );
}

// --- forgot and reset ----------------------------------------------------------

export interface ForgotPasswordFormProps extends Customisable<Slots> {
  /** Sends the link. The page says the same whether or not the account exists. */
  onSubmit: (email: string) => Answer | Promise<Answer>;
  heading?: Child;
  description?: Child;
  footer?: Child;
}

/** Ask for a reset link by email, answered the same whether or not the account exists. */
export function ForgotPasswordForm(props: ForgotPasswordFormProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(authStyles(), props.classes);
  const [sent, setSent] = createSignal<string | null>(null);
  const form = useArcForm(() => ({
    defaultValues: { email: "" },
    onSubmit: async ({ value, formApi }) => {
      if (await settleAnswer(formApi, props.onSubmit(value.email))) setSent(value.email);
    },
  }));
  return (
    <section class={arc(cls().form, props.class, props.className)} data-slot="forgot-password-form">
      <Show
        when={sent() === null}
        fallback={
          <Sent
            heading={messages().checkInbox}
            description={messages().resetSent(sent() ?? "")}
            classes={cls()}
          >
            {props.footer}
          </Sent>
        }
      >
        <Header
          heading={props.heading ?? messages().forgotPasswordHeading}
          description={props.description ?? messages().forgotPasswordDescription}
          classes={cls()}
        />
        <form.AppForm>
          <form
            class={cls().form}
            noValidate
            aria-label={messages().forgotPasswordHeading}
            onSubmit={(event: Event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.FormError />
            <form.AppField
              name="email"
              validators={{
                onSubmit: ({ value }: { value: string }) =>
                  value.includes("@") ? undefined : messages().emailInvalid,
              }}
            >
              {(field) => (
                <field.TextField label={messages().email} type="email" autoComplete="email" />
              )}
            </form.AppField>
            <form.SubmitButton>{messages().sendResetLink}</form.SubmitButton>
          </form>
        </form.AppForm>
        <Show when={props.footer !== undefined}>
          <div class={cls().description}>{props.footer}</div>
        </Show>
      </Show>
    </section>
  );
}

export interface ResetPasswordFormProps extends Customisable<Slots> {
  onSubmit: (password: string) => Answer | Promise<Answer>;
  heading?: Child;
  rules?: readonly PasswordRule[];
  /** Where "Sign in" goes once the password is set. */
  signInHref?: string;
}

/** Choose a new password from an emailed link, held to its rules and confirmed. */
export function ResetPasswordForm(props: ResetPasswordFormProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(authStyles(), props.classes);
  const [done, setDone] = createSignal(false);
  const rules = (): readonly PasswordRule[] => props.rules ?? defaultPasswordRules(messages());
  const form = useArcForm(() => ({
    defaultValues: { password: "", confirm: "" },
    onSubmit: async ({ value, formApi }) => {
      if (await settleAnswer(formApi, props.onSubmit(value.password))) setDone(true);
    },
  }));
  return (
    <section class={arc(cls().form, props.class, props.className)} data-slot="reset-password-form">
      <Show
        when={!done()}
        fallback={
          <div class={cls().sent} role="status" data-slot="auth-done">
            <h1 class={cls().heading}>{messages().passwordChanged}</h1>
            <Show when={props.signInHref !== undefined}>
              <a href={props.signInHref} class={fg.link}>
                {messages().signIn}
              </a>
            </Show>
          </div>
        }
      >
        <Header heading={props.heading ?? messages().resetPassword} classes={cls()} />
        <form.AppForm>
          <form
            class={cls().form}
            noValidate
            aria-label={messages().resetPassword}
            onSubmit={(event: Event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.FormError />
            <form.AppField
              name="password"
              validators={{
                onSubmit: ({ value }: { value: string }) =>
                  rules().every((rule) => rule.test(value)) ? undefined : messages().passwordWeak,
              }}
            >
              {(field) => (
                <>
                  <field.PasswordField label={messages().newPassword} autoComplete="new-password" />
                  <PasswordStrength
                    password={field().state.value}
                    rules={rules()}
                    classes={props.classes}
                  />
                </>
              )}
            </form.AppField>
            <form.AppField
              name="confirm"
              validators={{
                onSubmit: ({
                  value,
                  fieldApi,
                }: {
                  value: string;
                  fieldApi: { form: AnyFormApi };
                }) =>
                  value === fieldApi.form.state.values.password
                    ? undefined
                    : messages().passwordsDiffer,
              }}
            >
              {(field) => (
                <field.PasswordField
                  label={messages().confirmPassword}
                  autoComplete="new-password"
                />
              )}
            </form.AppField>
            <form.SubmitButton>{messages().setPassword}</form.SubmitButton>
          </form>
        </form.AppForm>
      </Show>
    </section>
  );
}

// --- second factor -------------------------------------------------------------------

export interface TwoFactorFormProps extends Customisable<Slots> {
  /** The code typed, or a recovery code with `recovery`. Answers with what was wrong, if anything. */
  onSubmit: (code: string, options: { recovery: boolean }) => Answer | Promise<Answer>;
  /** @default 6 */
  length?: number;
  heading?: Child;
  description?: Child;
  /** Adds "Send a new code", for a code sent by text or email. */
  onResend?: () => void | Promise<unknown>;
  /** Adds "Use a passkey instead". */
  onPasskey?: () => void | Promise<unknown>;
  /** Adds "Use a recovery code". @default true */
  recovery?: boolean;
}

/**
 * The second step of signing in: a one-time code on ui's `InputOTP`, sent as
 * soon as it is whole, or a recovery code, or a passkey.
 */
export function TwoFactorForm(props: TwoFactorFormProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(authStyles(), props.classes);
  const [recovery, setRecovery] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal<string | null>(null);
  const length = (): number => props.length ?? 6;
  const form = useArcForm(() => ({
    defaultValues: { code: "" },
    onSubmit: async ({ value, formApi }) => {
      await settleAnswer(formApi, props.onSubmit(value.code.trim(), { recovery: recovery() }));
    },
  }));
  const run = async (action: (() => void | Promise<unknown>) | undefined, said: string) => {
    setBusy(true);
    setNote(null);
    try {
      await action?.();
      setNote(said);
    } catch {
      setNote(messages().somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class={arc(cls().form, props.class, props.className)} data-slot="two-factor-form">
      <Header
        heading={props.heading ?? messages().twoFactorHeading}
        description={
          props.description ??
          (recovery() ? messages().recoveryDescription : messages().twoFactorDescription)
        }
        classes={cls()}
      />
      <form.AppForm>
        <form
          class={cls().form}
          noValidate
          aria-label={messages().twoFactorHeading}
          onSubmit={(event: Event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.FormError />
          <Show
            when={!recovery()}
            fallback={
              <form.AppField name="code">
                {(field) => <field.TextField label={messages().recoveryCode} autoComplete="off" />}
              </form.AppField>
            }
          >
            <form.AppField name="code">
              {(field) => (
                <div class={cls().otp} data-slot="two-factor-code">
                  <Label for="arc-two-factor-code">{messages().verificationCode}</Label>
                  <InputOTP
                    id="arc-two-factor-code"
                    maxLength={length()}
                    autoComplete="one-time-code"
                    autoFocus
                    value={field().state.value}
                    isInvalid={field().state.meta.errors.length > 0}
                    onChange={(value: string) => field().handleChange(value)}
                    onComplete={() => void form.handleSubmit()}
                  >
                    <InputOTPGroup>
                      <For each={Array.from({ length: length() }, (_, index) => index)}>
                        {(index: number) => <InputOTPSlot index={index} />}
                      </For>
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              )}
            </form.AppField>
          </Show>
          <form.SubmitButton>{messages().verify}</form.SubmitButton>
        </form>
      </form.AppForm>
      <Show when={note() !== null}>
        <p class={cls().description} role="status">
          {note()}
        </p>
      </Show>
      <div class={cls().actions} data-slot="auth-alternatives">
        <Show when={props.recovery !== false}>
          <Button
            variant="link"
            onPress={() => {
              form.setFieldValue("code", "");
              setRecovery(!recovery());
            }}
          >
            {recovery() ? messages().useCode : messages().useRecoveryCode}
          </Button>
        </Show>
        <Show when={props.onResend !== undefined && !recovery()}>
          <Button
            variant="link"
            isPending={busy()}
            onPress={() => void run(props.onResend, messages().codeResent)}
          >
            {messages().resendCode}
          </Button>
        </Show>
        <Show when={props.onPasskey !== undefined}>
          <Button variant="outline" onPress={() => void run(props.onPasskey, "")}>
            <KeyRound aria-hidden="true" />
            {messages().usePasskeyInstead}
          </Button>
        </Show>
      </div>
    </section>
  );
}

// --- recovery codes ------------------------------------------------------------------

export interface RecoveryCodesProps extends Customisable<Slots> {
  codes: readonly string[];
  heading?: Child;
  /** The file a download is saved as. @default "recovery-codes.txt" */
  filename?: string;
  /** Adds "I have saved these" before `onConfirm` can be pressed. */
  onConfirm?: () => void;
}

/** One-time recovery codes to keep: copied together, downloaded as a file, acknowledged. */
export function RecoveryCodes(props: RecoveryCodesProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(authStyles(), props.classes);
  const [saved, setSaved] = createSignal(false);
  const text = (): string => props.codes.join("\n");
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([`${text()}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = props.filename ?? "recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section class={arc(cls().form, props.class, props.className)} data-slot="recovery-codes">
      <Header
        heading={props.heading ?? messages().recoveryCodes}
        description={messages().recoveryCodesDescription}
        classes={cls()}
      />
      <ol class={cls().codes} data-slot="recovery-codes-list" aria-label={messages().recoveryCodes}>
        <For each={props.codes}>{(code: string) => <li dir="ltr">{code}</li>}</For>
      </ol>
      <div class={cls().actions}>
        <CopyButton value={text()} variant="outline" label={messages().copyCodes}>
          {messages().copyCodes}
        </CopyButton>
        <Button variant="outline" onPress={download}>
          <Download aria-hidden="true" />
          {messages().download}
        </Button>
      </div>
      <Show when={props.onConfirm !== undefined}>
        <div class={cls().confirm} data-slot="recovery-codes-confirm">
          <Checkbox id="arc-recovery-saved" checked={saved()} onCheckedChange={setSaved} />
          <Label for="arc-recovery-saved">{messages().savedCodes}</Label>
        </div>
        <Button isDisabled={!saved()} onPress={() => props.onConfirm?.()}>
          {messages().continue}
        </Button>
      </Show>
    </section>
  );
}

// --- passkey ---------------------------------------------------------------------------

export interface PasskeyPromptProps extends Customisable<Slots> {
  /** Runs the WebAuthn call. A rejection says it failed and lets the reader try again. */
  onAuthenticate: () => void | Promise<unknown>;
  /** Adds "Use another way". */
  onFallback?: () => void;
  heading?: Child;
  description?: Child;
}

/** Sign in or confirm with a passkey: what it is, one button, and another way. */
export function PasskeyPrompt(props: PasskeyPromptProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(authStyles(), props.classes);
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const go = async (): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      await props.onAuthenticate();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class={arc(cls().form, props.class, props.className)} data-slot="passkey-prompt">
      <div class={cls().sent}>
        <span class={cls().sentIcon} aria-hidden="true">
          <KeyRound />
        </span>
        <Header
          heading={props.heading ?? messages().passkeyHeading}
          description={props.description ?? messages().passkeyDescription}
          classes={cls()}
        />
      </div>
      <Show when={failed()}>
        <InlineAlert tone="danger">{messages().passkeyFailed}</InlineAlert>
      </Show>
      <Button isPending={busy()} onPress={() => void go()}>
        <KeyRound aria-hidden="true" />
        {failed() ? messages().retry : messages().usePasskey}
      </Button>
      <Show when={props.onFallback !== undefined}>
        <Button variant="ghost" onPress={() => props.onFallback?.()}>
          {messages().useAnotherWay}
        </Button>
      </Show>
    </section>
  );
}
