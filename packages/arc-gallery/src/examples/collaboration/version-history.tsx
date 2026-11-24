import { createSignal } from "@barqjs/core";
import { type VersionEntry, VersionHistory, toast } from "@barqjs/arc";
import { CodeBlock, CodeDiff } from "@barqjs/arc/code";

interface PolicyVersion extends VersionEntry {
  policy: string;
}

const policy = (seats: number, trial: number, sso: boolean, regions: string[]): string =>
  JSON.stringify(
    { plan: "Acme Business", seats, trialDays: trial, sso, regions, billing: "monthly" },
    null,
    2,
  );

const VERSIONS: PolicyVersion[] = [
  {
    id: "v4",
    label: "v4",
    author: { name: "Salama" },
    createdAt: "2026-11-24T09:12:00.000Z",
    summary: "Turned SSO on for the Business plan",
    current: true,
    policy: policy(50, 14, true, ["eu-west-1", "us-east-1"]),
  },
  {
    id: "v3",
    label: "v3",
    author: { name: "Lina" },
    createdAt: "2026-11-21T16:40:00.000Z",
    summary: "Added us-east-1",
    policy: policy(50, 14, false, ["eu-west-1", "us-east-1"]),
  },
  {
    id: "v2",
    author: { name: "Omar" },
    createdAt: "2026-11-14T11:05:00.000Z",
    summary: "Raised seats to 50",
    policy: policy(50, 30, false, ["eu-west-1"]),
  },
  {
    id: "v1",
    label: "Published",
    author: { name: "Maya" },
    createdAt: "2026-11-02T08:00:00.000Z",
    summary: "First version",
    policy: policy(25, 30, false, ["eu-west-1"]),
  },
];

const policyOf = (version: VersionEntry): string =>
  VERSIONS.find((one) => one.id === version.id)?.policy ?? "";

export default function VersionHistoryExample() {
  const [versions, setVersions] = createSignal<readonly VersionEntry[]>(VERSIONS);
  return (
    <VersionHistory
      aria-label="Plan policy history"
      versions={versions()}
      defaultSelectedId="v2"
      now="2026-11-24T12:00:00.000Z"
      renderPreview={(version) => (
        <CodeBlock
          filename={`policy-${version.id}.json`}
          language="json"
          code={policyOf(version)}
        />
      )}
      renderCompare={(older, newer) => (
        <CodeDiff
          original={policyOf(older)}
          modified={policyOf(newer)}
          language="json"
          layout="unified"
          originalLabel={older.label ?? older.id}
          modifiedLabel={newer.label ?? newer.id}
        />
      )}
      onRestore={(version) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            setVersions(versions().map((one) => ({ ...one, current: one.id === version.id })));
            toast.success(`Restored ${version.label ?? version.id}`);
            resolve();
          }, 700);
        })
      }
    />
  );
}
