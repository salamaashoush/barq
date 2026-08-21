// A zod-shaped Standard Schema: has BOTH `~standard` and `parse`.
export const validateSearch = {
  "~standard": {
    version: 1 as const,
    vendor: "zod",
    validate: (_v: unknown): { value: { page: number } } | { issues: readonly unknown[] } => ({
      value: { page: 1 },
    }),
  },
  parse: (_i: unknown): { wrong: true } => ({ wrong: true }),
};
export const Component = () => null;
