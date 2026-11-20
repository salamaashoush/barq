import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function KazakhTenge(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 8v12" />
      <path d="M6 4h12" />
      <path d="M6 8h12" />
    </svg>
  );
}
