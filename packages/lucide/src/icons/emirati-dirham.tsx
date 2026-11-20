import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function EmiratiDirham(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M11 4a8 8 0 0 1 0 16H6.406A.4.4 0 0 1 6 19.594V4.406A.4.4 0 0 1 6.406 4z" />
      <path d="M4 10h17" />
      <path d="M4 14h17" />
    </svg>
  );
}
