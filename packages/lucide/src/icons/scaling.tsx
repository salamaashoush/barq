import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Scaling(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M14 15H9v-5" />
      <path d="M16 3h5v5" />
      <path d="M21 3 9 15" />
    </svg>
  );
}
