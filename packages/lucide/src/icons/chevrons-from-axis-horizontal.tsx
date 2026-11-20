import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsFromAxisHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M22 12H2" />
      <path d="m8 17 4 4 4-4" />
      <path d="m8 7 4-4 4 4" />
    </svg>
  );
}
