import { Container, ForgotPasswordForm, Link } from "@barqjs/arc";

export default function ForgotPassword() {
  return (
    <Container size="sm">
      <ForgotPasswordForm
        description="Enter the address you sign in with. Type offline@example.com to see the request fail."
        onSubmit={async (email) => {
          await new Promise((resolve) => setTimeout(resolve, 800));
          if (email === "offline@example.com")
            return { form: "We could not send the email. Try again in a minute." };
          return undefined;
        }}
        footer={<Link href="#sign-in">Back to sign in</Link>}
      />
    </Container>
  );
}
