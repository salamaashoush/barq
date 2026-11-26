import { createSignal } from "@barqjs/core";
import { CheckResults, type SourceLocation, Stack, Text, documentName } from "@barqjs/arc";
import { CircleSlash } from "@barqjs/lucide/icons/circle-slash";

import { CHECKS } from "./data.ts";

export default function CheckResultsExample() {
  const [went, setWent] = createSignal<SourceLocation | undefined>(undefined);
  return (
    <Stack gap={3}>
      <CheckResults
        checks={CHECKS}
        verdicts={{ vacuous: { label: "Vacuous", tone: "info", icon: CircleSlash } }}
        onSelect={(location) => setWent(location)}
      />
      <div role="status">
        <Text size="sm" color="muted">
          {went() === undefined
            ? "Press a check's name to go to where it is written."
            : `Went to ${documentName(went()?.uri ?? "")}, line ${String(went()?.line ?? 1)}`}
        </Text>
      </div>
    </Stack>
  );
}
