import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@barqjs/ui";

const stack = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const caption = css`
  text-align: center;
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

export default function InputOTPControlled() {
  const [value, setValue] = createSignal("");

  return (
    <div class={stack}>
      <InputOTP
        maxLength={6}
        aria-label="One-time password"
        value={value()}
        onChange={(next: string) => setValue(next)}
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
      <div class={caption}>
        {() => (value() === "" ? "Enter your one-time password." : `You entered: ${value()}`)}
      </div>
    </div>
  );
}
