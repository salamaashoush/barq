import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowsToAxisDashedVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 10V8" />
      <path d="M12 16v-2" />
      <path d="M12 22v-2" />
      <path d="M12 4V2" />
      <path d="M16 12h6" />
      <path d="m19 15-3-3 3-3" />
      <path d="M2 12h6" />
      <path d="m5 15 3-3-3-3" />
    </svg>
  );
}
