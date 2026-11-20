import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Phi(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 2v20" />
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}
