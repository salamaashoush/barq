import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Route(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 5h8.5a1 1 0 010 7h-11a1 1 0 000 7H15" />
      <circle cx="18" cy="19" r="3" />
      <circle cx="6" cy="5" r="3" />
    </svg>
  );
}
