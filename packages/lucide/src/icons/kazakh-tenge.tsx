import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function KazakhTenge(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 8v12" />
      <path d="M6 4h12" />
      <path d="M6 8h12" />
    </svg>
  );
}
