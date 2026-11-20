import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Tablets(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="7" cy="7" r="5" />
      <circle cx="17" cy="17" r="5" />
      <path d="M12 17h10" />
      <path d="m3.46 10.54 7.08-7.08" />
    </svg>
  );
}
