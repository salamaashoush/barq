import { createSignal } from "@barqjs/core";
import {
  ErrorPage,
  NativeSelect,
  NativeSelectOption,
  type ServerErrorKind,
  Stack,
  StatusPage,
} from "@barqjs/arc";
import { layer } from "@barqjs/css";
import { edge, rounded } from "@barqjs/arc/style";

const gallery = layer("gallery");
const framed = gallery(edge.all, rounded.lg, { minBlockSize: "26rem" });

const KINDS: readonly ServerErrorKind[] = [
  "not-found",
  "forbidden",
  "gone",
  "signed-out",
  "offline",
  "unreachable",
  "failed",
];

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export default function StatusPages() {
  const [kind, setKind] = createSignal<ServerErrorKind>("not-found");
  const [retries, setRetries] = createSignal(0);
  return (
    <Stack gap={4}>
      <NativeSelect
        aria-label="Kind"
        value={kind()}
        onChange={(event: Event) =>
          setKind((event.target as HTMLSelectElement).value as ServerErrorKind)
        }
      >
        {KINDS.map((one) => (
          <NativeSelectOption value={one}>{one}</NativeSelectOption>
        ))}
      </NativeSelect>
      <StatusPage
        kind={kind()}
        class={framed}
        homeHref="#"
        signInHref="#"
        onRetry={() => setRetries((count) => count + 1)}
        onBack={() => setRetries(0)}
        problemCode={kind() === "failed" ? `db_timeout (${String(retries())} retries)` : undefined}
        details={kind() === "failed" ? "query on runs timed out after 30s" : undefined}
      />
      <ErrorPage
        class={framed}
        error={new ApiError(502, "upstream_unavailable", "bad gateway")}
        reset={() => setRetries((count) => count + 1)}
      />
    </Stack>
  );
}
