import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Omega(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3 20h4.5a.5.5 0 0 0 .5-.5v-.282a.52.52 0 0 0-.247-.437 8 8 0 1 1 8.494-.001.52.52 0 0 0-.247.438v.282a.5.5 0 0 0 .5.5H21" />
    </svg>
  );
}
