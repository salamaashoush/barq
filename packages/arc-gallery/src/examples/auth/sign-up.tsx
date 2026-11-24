import { createSignal } from "@barqjs/core";
import {
  Container,
  Input,
  Label,
  Link,
  PasswordStrength,
  SignUpForm,
  Stack,
  Text,
  defaultPasswordRules,
  useArcMessages,
} from "@barqjs/arc";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const notAcme = {
  label: "Not the word acme",
  test: (password: string) => !password.toLowerCase().includes("acme"),
};

export default function SignUp() {
  const messages = useArcMessages();
  function rules() {
    return [...defaultPasswordRules(messages()), notAcme];
  }
  const [password, setPassword] = createSignal("");

  return (
    <Stack gap={8}>
      <Container size="sm">
        <SignUpForm
          description="Free for three seats. Use taken@example.com to see an address refused."
          rules={rules()}
          verifyEmail
          terms={
            <>
              I agree to the <Link href="#terms">terms of service</Link> and the{" "}
              <Link href="#privacy">privacy policy</Link>
            </>
          }
          onSubmit={async (values) => {
            await wait(900);
            if (values.email === "taken@example.com")
              return { fields: { email: "An account already uses this address" } };
            return undefined;
          }}
          footer={
            <Text size="sm" color="muted">
              Have an account? <Link href="#sign-in">Sign in</Link>
            </Text>
          }
        />
      </Container>
      <Container size="sm">
        <Stack gap={2}>
          <Label for="own-password">PasswordStrength under a field of your own</Label>
          <Input
            id="own-password"
            type="password"
            autoComplete="new-password"
            value={password()}
            onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
          />
          <PasswordStrength password={password()} rules={rules()} />
        </Stack>
      </Container>
    </Stack>
  );
}
