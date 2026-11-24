import { describe, expect, test } from "bun:test";
import { type Child } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";
import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import {
  AuthLayout,
  ForgotPasswordForm,
  PasskeyPrompt,
  RecoveryCodes,
  ResetPasswordForm,
  type SignInValues,
  SignInForm,
  SignUpForm,
  TwoFactorForm,
  authStyles,
  passwordStrength,
} from "./auth.tsx";

async function fill(name: string | RegExp, text: string): Promise<void> {
  const box = screen.getByLabelText(name);
  await user.type(box, text);
  await settle();
}

async function press(name: string | RegExp): Promise<void> {
  await user.click(screen.getByRole("button", { name }));
  await settle();
}

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

describe("AuthLayout", () => {
  test("the brand above the form, the aside only on a wide screen, the footer under it", async () => {
    render(() => (
      <AuthLayout
        brand={<span>Acme</span>}
        aside={<p>Showcase</p>}
        footer={<a href="/terms">Terms</a>}
      >
        <SignInForm onSubmit={() => {}} />
      </AuthLayout>
    ));
    expect(screen.getByRole("main").textContent).toContain("Acme");
    expect(screen.getByRole("complementary").textContent).toBe("Showcase");
    expect(screen.getByRole("contentinfo").textContent).toBe("Terms");
    const aside = authStyles().aside.split(" ");
    const sheet = collectCss();
    expect(
      aside.some((one) => sheet.includes(`@media (width >= 64rem){.${one}{display:flex}`)),
    ).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

describe("SignInForm", () => {
  test("checks the fields, sends them, and shows what the server says is wrong", async () => {
    const sent: SignInValues[] = [];
    render(() => (
      <SignInForm
        forgotHref="/forgot"
        providers={<button type="button">Continue with GitHub</button>}
        footer={<a href="/sign-up">Create an account</a>}
        onSubmit={(values) => {
          sent.push(values);
          return { form: "Those details do not match an account" };
        }}
      />
    ));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeDefined();
    expect(screen.getByText("or")).toBeDefined();
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe(
      "/forgot",
    );
    await press("Sign in");
    expect(sent).toEqual([]);
    expect(screen.getByText("Enter an email address")).toBeDefined();

    await fill("Email", "salama@example.com");
    await fill("Password", "secret");
    await user.click(screen.getByRole("checkbox", { name: "Remember me" }));
    await settle();
    await press("Sign in");
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ email: "salama@example.com", password: "secret", remember: true });
    await waitFor(() =>
      expect(screen.getByText("Those details do not match an account")).toBeDefined(),
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a magic link replaces the password and says where it went", async () => {
    const links: string[] = [];
    render(() => (
      <SignInForm onSubmit={() => {}} onMagicLink={(email) => void links.push(email)} />
    ));
    await press("Email me a link");
    expect(screen.queryByLabelText("Password")).toBeNull();
    await fill("Email", "salama@example.com");
    await press("Send link");
    await waitFor(() => expect(screen.getByText("Check your inbox")).toBeDefined());
    expect(links).toEqual(["salama@example.com"]);
    expect(screen.getByRole("status").textContent).toContain("salama@example.com");
  });

  test("a passkey that fails says so, and its button is a finger's size", async () => {
    render(() => (
      <SignInForm onSubmit={() => {}} onPasskey={() => Promise.reject(new Error("cancelled"))} />
    ));
    const passkey = screen.getByRole("button", { name: "Sign in with a passkey" });
    expect(wears(passkey, touch.target)).toBe(true);
    user.tap(passkey);
    await waitFor(() =>
      expect(
        screen.getByText("The passkey did not work. Try again or use another way."),
      ).toBeDefined(),
    );
  });
});

describe("SignUpForm", () => {
  test("holds the password to its rules, ticking each, and wants it twice and the terms", async () => {
    const made: unknown[] = [];
    render(() => (
      <SignUpForm
        terms={<span>I agree to the terms</span>}
        verifyEmail
        onSubmit={(values) => void made.push(values)}
      />
    ));
    await fill("Full name", "Salama Ashoush");
    await fill("Email", "salama@example.com");
    await fill("Password", "abc");
    const rules = within(screen.getByRole("list", { name: "Password rules" })).getAllByRole(
      "listitem",
    );
    expect(rules.map((one) => one.hasAttribute("data-met"))).toEqual([false, true, false]);
    await fill("Password", "defgh12");
    expect(rules.map((one) => one.hasAttribute("data-met"))).toEqual([true, true, true]);
    expect(
      screen.getByRole("progressbar", { name: "Password strength" }).getAttribute("aria-valuetext"),
    ).toBe("Fair");
    await fill("Confirm password", "nope");
    await press("Create an account");
    expect(made).toEqual([]);
    expect(screen.getByText("The passwords do not match")).toBeDefined();
    expect(screen.getByText("Agree to continue")).toBeDefined();
    const confirm = screen.getByLabelText("Confirm password");
    await user.clear(confirm);
    await user.type(confirm, "abcdefgh12");
    await user.click(screen.getByRole("checkbox", { name: "I agree to the terms" }));
    await settle();
    await press("Create an account");
    await waitFor(() => expect(made).toHaveLength(1));
    await waitFor(() => expect(screen.getByText("Check your inbox")).toBeDefined());
  });

  test("scores a password by its length and the kinds of character it mixes", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(1);
    expect(passwordStrength("abcdefgh1")).toBe(2);
    expect(passwordStrength("Abcdefgh1!xyzw")).toBe(4);
  });
});

describe("ForgotPasswordForm and ResetPasswordForm", () => {
  test("a reset request is answered the same whether or not the account exists", async () => {
    render(() => <ForgotPasswordForm onSubmit={() => {}} />);
    await fill("Email", "nobody@example.com");
    await press("Send reset link");
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("If nobody@example.com"),
    );
  });

  test("a new password is checked, confirmed, and then signs in", async () => {
    const set: string[] = [];
    render(() => (
      <ResetPasswordForm signInHref="/sign-in" onSubmit={(value) => void set.push(value)} />
    ));
    await fill("New password", "abcdefgh12");
    await fill("Confirm password", "abcdefgh12");
    await press("Set password");
    await waitFor(() => expect(set).toEqual(["abcdefgh12"]));
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
  });
});

describe("TwoFactorForm", () => {
  test("a whole code sends itself; a recovery code and a new code are a press away", async () => {
    const codes: [string, boolean][] = [];
    let resent = 0;
    render(() => (
      <TwoFactorForm
        onSubmit={(code, { recovery }) => {
          codes.push([code, recovery]);
          return recovery ? undefined : { fields: { code: "That code has expired" } };
        }}
        onResend={() => {
          resent++;
        }}
      />
    ));
    const code = screen.getByLabelText("Verification code");
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    await user.type(code, "123456");
    await waitFor(() => expect(codes).toEqual([["123456", false]]));
    await press("Send a new code");
    expect(resent).toBe(1);
    expect(screen.getByRole("status").textContent).toBe("A new code is on its way.");
    await press("Use a recovery code");
    await fill("Recovery code", "abcd-efgh");
    await press("Verify");
    await waitFor(() => expect(codes.at(-1)).toEqual(["abcd-efgh", true]));
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

describe("RecoveryCodes", () => {
  test("lists the codes left to right, copies and downloads them, and waits to be saved", async () => {
    const created: Blob[] = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob) => {
      created.push(blob);
      return "blob:codes";
    };
    let confirmed = false;
    render(() => (
      <RecoveryCodes
        codes={["aaaa-1111", "bbbb-2222"]}
        onConfirm={() => {
          confirmed = true;
        }}
      />
    ));
    const list = screen.getByRole("list", { name: "Recovery codes" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((one) => one.getAttribute("dir")),
    ).toEqual(["ltr", "ltr"]);
    expect(screen.getByRole("button", { name: "Copy codes" })).toBeDefined();
    await press("Download");
    expect(await created[0]?.text()).toBe("aaaa-1111\nbbbb-2222\n");
    URL.createObjectURL = original;
    const go = screen.getByRole("button", { name: "Continue" });
    expect(go.hasAttribute("disabled") || go.getAttribute("aria-disabled") === "true").toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "I have saved these codes" }));
    await settle();
    await press("Continue");
    expect(confirmed).toBe(true);
  });
});

describe("PasskeyPrompt", () => {
  test("asks the app to authenticate, offers to try again, and another way", async () => {
    let calls = 0;
    let fellBack = false;
    render(() => (
      <PasskeyPrompt
        onAuthenticate={() => {
          calls++;
          return calls === 1 ? Promise.reject(new Error("no")) : Promise.resolve();
        }}
        onFallback={() => {
          fellBack = true;
        }}
      />
    ));
    await press("Use passkey");
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeDefined());
    await press("Retry");
    expect(calls).toBe(2);
    await press("Use another way");
    expect(fellBack).toBe(true);
  });
});

describe("the auth templates", () => {
  test("run right to left", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <AuthLayout brand="Acme">
          <SignUpForm onSubmit={() => {}} />
        </AuthLayout>
      </Arabic>
    ));
    expect(slot("auth-layout")?.closest("[dir=rtl]")).not.toBeNull();
    expect(slot("password-rules")).not.toBeNull();
  });

  test("take a class per part", () => {
    render(() => (
      <AuthLayout
        class="mine"
        classes={{ root: "r", main: "m", content: "c", brand: "b", footer: "f" }}
        brand="Acme"
        footer="Legal"
      >
        <SignInForm onSubmit={() => {}} classes={{ heading: "h", form: "o" }} />
      </AuthLayout>
    ));
    for (const [name, cls] of [
      ["auth-layout", "r"],
      ["auth-layout-main", "m"],
      ["auth-layout-content", "c"],
      ["auth-layout-brand", "b"],
      ["auth-layout-footer", "f"],
      ["auth-heading", "h"],
      ["sign-in-form", "o"],
    ] as const) {
      expect(slot(name)?.classList.contains(cls)).toBe(true);
    }
    expect(slot("auth-layout")?.classList.contains("mine")).toBe(true);
  });

  test("hydrate what the server wrote", async () => {
    const result = await hydrates(`
      import { AuthLayout, SignInForm } from "<arc>";
      export function Page() {
        return (
          <AuthLayout brand="Acme" aside={<p>Welcome</p>}>
            <SignInForm forgotHref="/forgot" onSubmit={() => {}} />
          </AuthLayout>
        );
      }
    `);
    expect(result.container.querySelector("h1")?.textContent).toBe("Sign in");
    result.unmount();
  });

  test("hydrate a footer that is a paragraph of its own", async () => {
    const result = await hydrates(`
      import { ForgotPasswordForm, SignInForm, SignUpForm, Text } from "<arc>";
      export function Page() {
        return (
          <>
            <SignInForm onSubmit={() => {}} footer={<Text size="sm">No account? <a href="/sign-up">Sign up</a></Text>} />
            <SignUpForm onSubmit={() => {}} footer={<p>Have an account? <a href="/sign-in">Sign in</a></p>} />
            <ForgotPasswordForm onSubmit={() => {}} footer={<p>Remembered it?</p>} />
          </>
        );
      }
    `);
    expect(result.container.querySelectorAll("p p")).toHaveLength(0);
    result.unmount();
  });
});
