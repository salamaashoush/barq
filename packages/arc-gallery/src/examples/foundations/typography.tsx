import { Code, Heading, Link, Prose, Stack, Text } from "@barqjs/arc";
import { Grid } from "@barqjs/arc";

export default function Typography() {
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
      <Stack gap={3}>
        <Heading level={1} size="3xl">
          Display, 3xl
        </Heading>
        <Heading level={2}>Billing, level 2</Heading>
        <Heading level={3}>Payment method, level 3</Heading>
        <Heading level={4} color="muted">
          Muted, level 4
        </Heading>
        <Heading level={5}>Level 5</Heading>
        <Heading level={6}>Level 6, small capitals</Heading>
        <Heading level={3} size="md" truncate>
          A heading cut to one line when the column is narrower than Acme's longest project name
        </Heading>
      </Stack>

      <Stack gap={2}>
        <Text size="lg" weight="strong">
          Text, lg strong
        </Text>
        <Text size="md">Invoices are sent on the first of the month.</Text>
        <Text>Small is the default size for running text.</Text>
        <Text size="xs" color="muted">
          Extra small, muted
        </Text>
        <Text color="faint">Faint, for what can be skipped</Text>
        <Text color="success">Payment received</Text>
        <Text color="warning">Card expires next month</Text>
        <Text color="danger">Payment failed</Text>
        <Text color="info">Scheduled for Monday</Text>
        <Text numeric>12:04:59 and 08:11:10 line up</Text>
        <Text mono>sha256:9f2c41ab</Text>
        <Text lines={2}>
          Two lines at most: Salama left a long note on the Acme renewal, covering the seat count,
          the discount the team agreed in October, the new billing contact at example.com and the
          date the contract has to be countersigned by, which is the end of the quarter.
        </Text>
        <Text>
          Set <Code>API_TOKEN</Code> before you deploy, then read the{" "}
          <Link href="/foundations#typography">deployment guide</Link>, the{" "}
          <Link href="https://example.com/status">status page</Link> or the{" "}
          <Link href="/foundations#typography" color="muted" underline="hover">
            changelog
          </Link>
          .
        </Text>
        <Text>
          <Link isDisabled href="/foundations">
            A disabled link
          </Link>
        </Text>
      </Stack>

      <Prose size="sm">
        <h2>Release notes</h2>
        <p>
          Version 2.4 brings <strong>shared workspaces</strong> to every Acme plan. Invite a
          teammate from <em>Settings</em>, and they see the same projects you do.
        </p>
        <ul>
          <li>Exports run in the background and land in your inbox.</li>
          <li>
            The API accepts <code>If-Match</code> on every write.
          </li>
        </ul>
        <blockquote>Everything we ship reads the same in Arabic as in English.</blockquote>
        <pre>
          <code>curl https://api.example.com/v2/projects</code>
        </pre>
      </Prose>

      <Prose
        size="sm"
        width="full"
        html="<h3>From a CMS</h3><p>Markup a renderer already made safe, drawn with the same rules.</p><ol><li>Draft</li><li>Review</li><li>Publish</li></ol>"
      />
    </Grid>
  );
}
