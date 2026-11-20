import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LogOut(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </svg>
  );
}
