/** Everything a cascade layer of `sheet` holds, however many blocks it is written in. */
export function layerBody(sheet: string, name: string): string {
  const open = `@layer ${name}{`;
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = sheet.indexOf(open, from);
    if (at < 0) break;
    const start = at + open.length;
    let depth = 1;
    let index = start;
    for (; index < sheet.length; index++) {
      if (sheet[index] === "{") depth++;
      else if (sheet[index] === "}" && --depth === 0) break;
    }
    out.push(sheet.slice(start, index));
    from = index;
  }
  return out.join("");
}
