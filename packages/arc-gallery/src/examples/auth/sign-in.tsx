import { Button, Container, Link, SignInForm, Text, toast } from "@barqjs/arc";
import { KeyRound } from "@barqjs/lucide/icons/key-round";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function SignIn() {
  return (
    <Container size="sm">
      <SignInForm
        description="Use salama@example.com with any password. Any other address is refused."
        defaultEmail="salama@example.com"
        providers={
          <Button variant="outline" onPress={() => toast("Redirecting to your identity provider")}>
            <KeyRound aria-hidden="true" />
            Continue with Acme SSO
          </Button>
        }
        forgotHref="#forgot-password"
        onSubmit={async (values) => {
          await wait(800);
          if (values.email !== "salama@example.com") {
            return { fields: { email: "No account uses this address" } };
          }
          if (values.password.length < 8) return { form: "That email and password do not match." };
          toast.success(`Signed in${values.remember ? ", and remembered on this device" : ""}`);
          return undefined;
        }}
        onMagicLink={async (email) => {
          await wait(600);
          toast(`Sign-in link sent to ${email}`);
        }}
        onPasskey={async () => {
          await wait(600);
          throw new Error("The passkey was dismissed");
        }}
        footer={
          <Text size="sm" color="muted">
            No account? <Link href="#sign-up">Sign up</Link>
          </Text>
        }
      />
    </Container>
  );
}
