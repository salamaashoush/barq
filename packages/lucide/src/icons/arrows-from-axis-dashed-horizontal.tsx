import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowsFromAxisDashedHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 12H8" />
      <path d="M12 16v6" />
      <path d="M12 2v6" />
      <path d="M16 12h-2" />
      <path d="M22 12h-2" />
      <path d="M4 12H2" />
      <path d="m9 19 3 3 3-3" />
      <path d="m9 5 3-3 3 3" />
    </svg>
  );
}
