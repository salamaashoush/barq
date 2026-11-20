import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TurkishLira(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m14 10-8 4" />
      <path d="M14 5 6 9" />
      <path d="M18 12a8 8 0 01-7.003 7.937c-.547.07-.997-.385-.997-.937V4" />
    </svg>
  );
}
