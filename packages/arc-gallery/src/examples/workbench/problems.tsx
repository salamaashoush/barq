import { createSignal } from "@barqjs/core";
import {
  ProblemsPanel,
  type SourceLocation,
  Stack,
  Text,
  documentName,
  positionText,
} from "@barqjs/arc";

import { PROBLEMS } from "./data.ts";

export default function Problems() {
  const [went, setWent] = createSignal<SourceLocation | undefined>(undefined);
  return (
    <Stack gap={3}>
      <ProblemsPanel problems={PROBLEMS} onSelect={(location) => setWent(location)} />
      <div role="status">
        <Text size="sm" color="muted">
          {went() === undefined
            ? "Press a problem, or choose one and press Enter, to go to its line."
            : `Went to ${documentName(went()?.uri ?? "")}:${positionText(went() ?? { line: 1 })}`}
        </Text>
      </div>
    </Stack>
  );
}
