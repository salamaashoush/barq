import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "auth",
  title: "Auth templates",
  description: "Sign in, sign up, recovery and second factors, ready to wire to a backend.",
  examples: [
    {
      id: "auth-layout",
      title: "Auth layout",
      description:
        "The brand above the form, a showcase beside it on a wide screen, and legal links under it.",
      covers: ["AuthLayout"],
    },
    {
      id: "sign-in",
      title: "Sign in",
      description:
        "A provider, remember me, a forgotten password link, a magic link, a passkey that fails, and refusals from the server.",
      covers: ["SignInForm"],
    },
    {
      id: "sign-up",
      title: "Sign up",
      description:
        "A password held to rules with its strength under it, terms to agree to, and a check-your-inbox step.",
      covers: ["SignUpForm", "PasswordStrength", "defaultPasswordRules"],
    },
    {
      id: "forgot-password",
      title: "Forgot password",
      description: "Answered the same whether or not the account exists, unless sending fails.",
      covers: ["ForgotPasswordForm"],
    },
    {
      id: "reset-password",
      title: "Reset password",
      description: "A new password held to the rules and confirmed, then a link to sign in.",
      covers: ["ResetPasswordForm"],
    },
    {
      id: "two-factor",
      title: "Two-factor code",
      description:
        "A one-time code sent as soon as it is whole, a recovery code instead, a new code, or a passkey.",
      covers: ["TwoFactorForm"],
    },
    {
      id: "recovery-codes",
      title: "Recovery codes",
      description: "Codes to copy or download, and a confirmation once they are saved.",
      covers: ["RecoveryCodes"],
    },
    {
      id: "passkey",
      title: "Passkey prompt",
      description:
        "One button for the browser's passkey call, Retry when it fails, and another way in.",
      covers: ["PasskeyPrompt"],
    },
  ],
};
