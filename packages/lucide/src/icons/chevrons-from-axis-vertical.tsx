import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsFromAxisVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 2v20" />
      <path d="m17 8 4 4-4 4" />
      <path d="m7 8-4 4 4 4" />
    </svg>
  );
}
