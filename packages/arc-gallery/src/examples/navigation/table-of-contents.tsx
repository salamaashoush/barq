import { Grid, Prose, TableOfContents } from "@barqjs/arc";

export default function Contents() {
  return (
    <Grid columns={{ base: 1, cqMd: 3 }} gap={6}>
      <TableOfContents
        sticky
        offset={72}
        title="On this page"
        items={[
          { id: "toc-install", label: "Install" },
          {
            id: "toc-usage",
            label: "Usage",
            items: [
              { id: "toc-options", label: "Options" },
              { id: "toc-limits", label: "Limits" },
            ],
          },
          { id: "toc-faq", label: "Questions" },
        ]}
      />
      <Prose size="sm">
        <h3 id="toc-install">Install</h3>
        <p>
          Add the Acme SDK to your project and set API_TOKEN in the environment of every service
          that calls it.
        </p>
        <p>The SDK reads the token once, at start-up, so a rotated token needs a restart.</p>
        <h3 id="toc-usage">Usage</h3>
        <p>
          Create one client per process. It keeps a pool of connections and retries a request that
          timed out once.
        </p>
        <h4 id="toc-options">Options</h4>
        <p>
          Pass a region to pin requests to it, and a timeout in milliseconds for a request that may
          take longer.
        </p>
        <h4 id="toc-limits">Limits</h4>
        <p>
          Each workspace may send 500 requests a minute. The response headers say how many are left
          in the window.
        </p>
        <h3 id="toc-faq">Questions</h3>
        <p>
          Write to support@example.com, or ask in the community forum where Lina and Omar answer
          most days.
        </p>
      </Prose>
    </Grid>
  );
}
