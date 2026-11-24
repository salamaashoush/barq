import type { Demos } from "../../gallery/types.ts";
import AuthLayout from "./auth-layout.tsx";
import authLayout from "./auth-layout.tsx?raw";
import ForgotPassword from "./forgot-password.tsx";
import forgotPassword from "./forgot-password.tsx?raw";
import Passkey from "./passkey.tsx";
import passkey from "./passkey.tsx?raw";
import RecoveryCodes from "./recovery-codes.tsx";
import recoveryCodes from "./recovery-codes.tsx?raw";
import ResetPassword from "./reset-password.tsx";
import resetPassword from "./reset-password.tsx?raw";
import SignIn from "./sign-in.tsx";
import signIn from "./sign-in.tsx?raw";
import SignUp from "./sign-up.tsx";
import signUp from "./sign-up.tsx?raw";
import TwoFactor from "./two-factor.tsx";
import twoFactor from "./two-factor.tsx?raw";

export const demos: Demos = {
  "auth-layout": { component: AuthLayout, code: authLayout },
  "sign-in": { component: SignIn, code: signIn },
  "sign-up": { component: SignUp, code: signUp },
  "forgot-password": { component: ForgotPassword, code: forgotPassword },
  "reset-password": { component: ResetPassword, code: resetPassword },
  "two-factor": { component: TwoFactor, code: twoFactor },
  "recovery-codes": { component: RecoveryCodes, code: recoveryCodes },
  passkey: { component: Passkey, code: passkey },
};
