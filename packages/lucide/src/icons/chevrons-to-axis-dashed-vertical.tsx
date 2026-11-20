import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsToAxisDashedVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 14v2" />
      <path d="M12 20v2" />
      <path d="M12 2v2" />
      <path d="M12 8v2" />
      <path d="m21 8-4 4 4 4" />
      <path d="m3 8 4 4-4 4" />
    </svg>
  );
}
