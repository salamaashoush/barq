import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function WalletMinimal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17 14h.01" />
      <path d="M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14" />
    </svg>
  );
}
