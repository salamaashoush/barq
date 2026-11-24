import { AuthLayout, Heading, Link, SignInForm, Stack, Text, toast } from "@barqjs/arc";
import { layout, space } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { Zap } from "@barqjs/lucide/icons/zap";

const demo = layer("demo");

/** The layout fills the screen on a real page; here it is the card's height. */
const framed = demo({ minHeight: "40rem" });
const showcase = demo(layout.column, layout.centre, { padding: space.x10, height: "100%" });

export default function AuthLayoutExample() {
  return (
    <AuthLayout
      classes={{ root: framed }}
      brand={
        <>
          <Zap aria-hidden="true" />
          Acme
        </>
      }
      aside={
        <div class={showcase}>
          <Stack gap={3}>
            <Heading level={2} size="lg">
              Every service, one dashboard.
            </Heading>
            <Text color="muted">
              Uptime, invoices and incidents for the whole Acme fleet, in real time.
            </Text>
          </Stack>
        </div>
      }
      footer={
        <>
          <Link href="#terms">Terms</Link>
          <Link href="#privacy">Privacy</Link>
          <Text as="span" size="sm" color="muted">
            © 2026 Acme
          </Text>
        </>
      }
    >
      <SignInForm
        forgotHref="#forgot-password"
        onSubmit={async () => {
          await new Promise((resolve) => setTimeout(resolve, 600));
          toast.success("Signed in");
          return undefined;
        }}
      />
    </AuthLayout>
  );
}
