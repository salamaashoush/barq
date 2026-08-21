export const validateSearch = { parse: (_i: unknown): { q: string } => ({ q: "" }) };
export const loader = { handler: async () => ({ rows: [1] }) };
export const Component = () => null;
