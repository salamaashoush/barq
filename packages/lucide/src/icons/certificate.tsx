import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Certificate(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 10H6" />
      <path d="m20.69 15.479 1.29 4.88a.5.5 0 01-.698.591l-1.843-.849a1 1 0 00-.879.001l-1.846.85a.5.5 0 01-.692-.593l1.29-4.88" />
      <path d="M22 6.675V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h8" />
      <path d="M6 14h4" />
      <circle cx="19" cy="13" r="3" />
    </svg>
  );
}
