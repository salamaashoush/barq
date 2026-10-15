export const width = (): number => (globalThis as { innerWidth?: number }).innerWidth ?? 0;
