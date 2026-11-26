import { createSignal } from "@barqjs/core";
import {
  Inline,
  Label,
  SnippetValue,
  SnippetValuesProvider,
  Stack,
  Switch,
  Text,
  readerOrigin,
  useSnippetValues,
} from "@barqjs/arc";
import { type CodeTab, CodeTabs, shellQuote } from "@barqjs/arc/code";

const DEFAULTS = {
  origin: "https://acme.example.com",
  project: "storefront",
  token: "ak_live_…",
};

interface InstallOptions {
  keyInline: boolean;
  allowlist: string;
}

function installTabs(options: InstallOptions, values: Readonly<Record<string, string>>): CodeTab[] {
  const key = options.keyInline ? (values.token ?? "") : "$ACME_KEY";
  const flags = [
    `--server ${shellQuote(values.origin ?? "")}`,
    `--key ${shellQuote(key)}`,
    options.allowlist === "" ? "" : `--allow ${shellQuote(options.allowlist)}`,
  ].filter((one) => one !== "");
  return [
    {
      id: "binary",
      label: "Binary",
      terminal: true,
      code: `curl -fsSL ${values.origin ?? ""}/install.sh | sh\nacme-agent ${flags.join(" \\\n  ")}`,
      note: "Linux or macOS, on the machine that can reach your private network.",
    },
    {
      id: "docker",
      label: "Docker",
      terminal: true,
      code: `docker run -d --name acme-agent \\\n  ghcr.io/acme/agent:2.4 \\\n  ${flags.join(" \\\n  ")}`,
    },
    {
      id: "compose",
      label: "Compose",
      language: "yaml",
      filename: "compose.yaml",
      code: `services:\n  agent:\n    image: ghcr.io/acme/agent:2.4\n    command: ${flags.join(" ")}\n    restart: unless-stopped\n`,
    },
    {
      id: "systemd",
      label: "systemd",
      language: "toml",
      filename: "/etc/systemd/system/acme-agent.service",
      code: `[Service]\nExecStart=/usr/local/bin/acme-agent ${flags.join(" ")}\nRestart=always\n`,
    },
  ];
}

function Install() {
  const values = useSnippetValues();
  const [inline, setInline] = createSignal(false);
  return (
    <Stack gap={3}>
      <Text size="sm">
        Connecting project <SnippetValue name="project" /> at <SnippetValue name="origin" />.
      </Text>
      <Inline gap={3} align="center">
        <Switch id="install-key-inline" checked={inline()} onCheckedChange={setInline} />
        <Label for="install-key-inline">
          Put the key in the command, not an environment variable
        </Label>
      </Inline>
      <CodeTabs
        aria-label="Install the agent"
        group="install-platform"
        items={installTabs(
          { keyInline: inline(), allowlist: "*.internal.acme.example.com" },
          values(),
        )}
      />
    </Stack>
  );
}

export default function CodeTabsExample() {
  return (
    <Stack gap={6}>
      <SnippetValuesProvider defaults={DEFAULTS} resolve={readerOrigin}>
        <Install />
      </SnippetValuesProvider>
      <Stack gap={1.5}>
        <Text size="sm">Two groups of tabs sharing one choice, remembered on the next page:</Text>
        <CodeTabs
          aria-label="Add the package"
          group="package-manager"
          highlighter="light"
          items={[
            { id: "bun", label: "bun", code: "bun add @barqjs/arc", terminal: true },
            { id: "npm", label: "npm", code: "npm install @barqjs/arc", terminal: true },
            { id: "pnpm", label: "pnpm", code: "pnpm add @barqjs/arc", terminal: true },
          ]}
        />
        <CodeTabs
          aria-label="Start the dev server"
          group="package-manager"
          highlighter="light"
          items={[
            { id: "bun", label: "bun", code: "bun run dev", terminal: true },
            { id: "npm", label: "npm", code: "npm run dev", terminal: true },
            { id: "pnpm", label: "pnpm", code: "pnpm dev", terminal: true },
          ]}
        />
      </Stack>
    </Stack>
  );
}
