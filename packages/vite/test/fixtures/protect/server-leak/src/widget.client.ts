export function width(): number {
  return (globalThis as Viewport).innerWidth ?? 0;
}

interface Viewport {
  innerWidth?: number;
}
