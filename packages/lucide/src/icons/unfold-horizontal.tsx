import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UnfoldHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 12h6" />
      <path d="M8 12H2" />
      <path d="M12 2v2" />
      <path d="M12 8v2" />
      <path d="M12 14v2" />
      <path d="M12 20v2" />
      <path d="m19 15 3-3-3-3" />
      <path d="m5 9-3 3 3 3" />
    </svg>
  );
}
