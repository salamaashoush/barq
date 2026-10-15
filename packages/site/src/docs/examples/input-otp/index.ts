import type { Demo } from "../../registry.ts";
import InputOtpDemo from "./input-otp-demo.tsx";
import inputOtpDemo from "./input-otp-demo.tsx?raw";
import InputOtpPattern from "./input-otp-pattern.tsx";
import inputOtpPattern from "./input-otp-pattern.tsx?raw";
import InputOtpSeparator from "./input-otp-separator.tsx";
import inputOtpSeparator from "./input-otp-separator.tsx?raw";
import InputOtpDisabled from "./input-otp-disabled.tsx";
import inputOtpDisabled from "./input-otp-disabled.tsx?raw";
import InputOtpControlled from "./input-otp-controlled.tsx";
import inputOtpControlled from "./input-otp-controlled.tsx?raw";
import InputOtpInvalid from "./input-otp-invalid.tsx";
import inputOtpInvalid from "./input-otp-invalid.tsx?raw";
import InputOtpFourDigits from "./input-otp-four-digits.tsx";
import inputOtpFourDigits from "./input-otp-four-digits.tsx?raw";
import InputOtpAlphanumeric from "./input-otp-alphanumeric.tsx";
import inputOtpAlphanumeric from "./input-otp-alphanumeric.tsx?raw";
import InputOtpForm from "./input-otp-form.tsx";
import inputOtpForm from "./input-otp-form.tsx?raw";
import InputOtpRtl from "./input-otp-rtl.tsx";
import inputOtpRtl from "./input-otp-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: inputOtpDemo,
    component: InputOtpDemo,
  },
  {
    title: "Pattern",
    note: "Use the `pattern` prop to define a custom pattern for the OTP input. `REGEXP_ONLY_DIGITS` accepts digits only.",
    code: inputOtpPattern,
    component: InputOtpPattern,
  },
  {
    title: "Separator",
    note: "Use the `InputOTPSeparator` component to add a separator between input groups.",
    code: inputOtpSeparator,
    component: InputOtpSeparator,
  },
  {
    title: "Disabled",
    note: "Use the `disabled` prop to disable the input.",
    code: inputOtpDisabled,
    component: InputOtpDisabled,
  },
  {
    title: "Controlled",
    note: "Use the `value` and `onChange` props to control the input value.",
    code: inputOtpControlled,
    component: InputOtpControlled,
  },
  {
    title: "Invalid",
    note: "Use `aria-invalid` to show an error state.",
    code: inputOtpInvalid,
    component: InputOtpInvalid,
  },
  {
    title: "Four Digits",
    note: "A common pattern for PIN codes. This uses the `pattern` prop to only allow digits.",
    code: inputOtpFourDigits,
    component: InputOtpFourDigits,
  },
  {
    title: "Alphanumeric",
    note: "Use `REGEXP_ONLY_DIGITS_AND_CHARS` to accept both letters and numbers.",
    code: inputOtpAlphanumeric,
    component: InputOtpAlphanumeric,
  },
  {
    title: "Form",
    size: "auto",
    code: inputOtpForm,
    component: InputOtpForm,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The boxes fill from the inline start.",
    rtl: true,
    code: inputOtpRtl,
    component: InputOtpRtl,
  },
];
