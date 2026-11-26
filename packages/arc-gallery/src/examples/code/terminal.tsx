import { Stack, Text } from "@barqjs/arc";
import { Highlight, TerminalBlock } from "@barqjs/arc/code";

export default function Terminal() {
  return (
    <Stack gap={4}>
      <TerminalBlock code={"bun add @barqjs/arc\nbun run dev"} />
      <TerminalBlock
        filename="Install the runner"
        code={
          'docker run -d --name acme-runner \\\n  -e ACME_KEY="$ACME_KEY" \\\n  --restart unless-stopped \\\n  ghcr.io/acme/runner:2.4'
        }
        wrap={false}
      />
      <TerminalBlock
        transcript
        label="A session"
        code={
          "$ acme status\nAPI       up    42 ms\nWorkers   up    3 of 3\nQueue     slow  1,204 waiting\n$ acme logs --tail 2\n09:30:05 worker-2 picked job 8f2\n09:30:06 worker-2 done in 1.1 s"
        }
      />
      <Stack gap={1.5}>
        <Text size="sm">
          The light highlighter, for a page that must not load a grammar: shell, TOML, YAML, JSON
          and TypeScript.
        </Text>
        <TerminalBlock
          highlighter="light"
          code={'acme deploy --region eu-west-1 --tag "release 2.4" # 2 min'}
        />
        <Highlight
          highlighter="light"
          language="yaml"
          code={"name: acme\nreplicas: 3\nimage: ${{ vars.IMAGE }}"}
        />
      </Stack>
    </Stack>
  );
}
