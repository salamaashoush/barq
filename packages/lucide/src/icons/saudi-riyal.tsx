import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SaudiRiyal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 2.977v13.19a2 2 0 01-1.23 1.846L4 19.999" />
      <path d="M14 4v9.523a1 1 0 001.371.928L19 13" />
      <path d="m19 18-5 2" />
      <path d="M19 8 4 14" />
    </svg>
  );
}
