import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Doghouse(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m2 9.718 8.82-6.333a2 2 0 012.36 0L22 9.718" />
      <path d="m20 8.282-1.007 10.902A2 2 0 0117 21H7a2 2 0 01-1.992-1.816L4 8.282" />
      <path d="M8.5 9.938a7 7 0 017 0" />
      <path d="M9 21v-5a3 3 0 016 0v5" />
    </svg>
  );
}
