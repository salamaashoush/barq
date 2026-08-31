import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListFilterPlus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 5H2" />
      <path d="M6 12h12" />
      <path d="M9 19h6" />
      <path d="M16 5h6" />
      <path d="M19 8V2" />
    </svg>
  );
}
