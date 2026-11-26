import { Button, Link, SuccessState } from "@barqjs/arc";

export default function Success() {
  return (
    <SuccessState
      heading="You're all set"
      description="The Acme workspace is ready, and your first check runs in a minute."
      tips={[
        "Invite your team from Settings, Members",
        "Add an alert channel so failures reach someone",
        "Install the CLI to run suites from your machine",
      ]}
      actions={<Button href="#">Open the workspace</Button>}
      help={<Link href="#">Read the getting started guide</Link>}
    />
  );
}
