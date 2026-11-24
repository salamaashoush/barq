import type { ParseSpreadsheetResult, SpreadsheetSeries } from "./types.ts";

/** A cell as a number: `1,200`, `$5`, `-3%`; `null` when it is not one. */
export function tryParseNumber(text: string | undefined): number | null {
  if (text === undefined) return null;
  const match = /^([-+]?)[$€£¥₩]?([-+]?)([\d.,]+)[%]?$/.exec(text);
  if (!match) {
    return null;
  }
  return parseFloat(((match[1] || match[2] || "") + (match[3] ?? "")).replace(/,/g, ""));
}

function cell(row: readonly string[] | undefined, index: number): string {
  return row?.[index] ?? "";
}

function numberAt(row: readonly string[], index: number): number {
  return tryParseNumber(row[index]) ?? 0;
}

function isNumericColumn(lines: readonly string[][], columnIndex: number) {
  return lines.slice(1).every((line) => tryParseNumber(line[columnIndex]) !== null);
}

/** Rows of cells as a chart's series: a column per series, or a row per series when wide. */
export function tryParseCells(cells: readonly string[][]): ParseSpreadsheetResult {
  const [header] = cells;
  if (!header) {
    return { ok: false, reason: "No values" };
  }
  const numCols = header.length;

  if (numCols > 2) {
    const hasHeader = header.every((value) => tryParseNumber(value) === null);
    const rows = hasHeader ? cells.slice(1) : cells;

    if (rows.length < 1) {
      return { ok: false, reason: "No data rows" };
    }

    const invalidNumericColumn = rows.some((row) =>
      row.slice(1).some((value) => tryParseNumber(value) === null),
    );
    if (invalidNumericColumn) {
      return { ok: false, reason: "Value is not numeric" };
    }

    // more value columns than rows is "wide" data: the columns are the
    // labels and each row a series, which is what a radar chart wants
    const numValueCols = numCols - 1;
    if (numValueCols > rows.length) {
      const labels = hasHeader ? header.slice(1).map((value) => value.trim()) : null;
      const series: SpreadsheetSeries[] = rows.map((row) => ({
        title: cell(row, 0).trim() || null,
        values: row.slice(1).map((value) => tryParseNumber(value) ?? 0),
      }));
      const [only] = series;
      const title =
        series.length === 1 && only
          ? only.title
          : hasHeader
            ? cell(header, 0).trim() || null
            : null;
      return { ok: true, data: { title, labels, series } };
    }

    const series = header.slice(1).map((seriesTitle, index) => {
      const valueColumnIndex = index + 1;
      const fallbackTitle = `Series ${valueColumnIndex}`;
      return {
        title: hasHeader ? seriesTitle.trim() || fallbackTitle : fallbackTitle,
        values: rows.map((row) => numberAt(row, valueColumnIndex)),
      };
    });

    return {
      ok: true,
      data: {
        title: hasHeader ? cell(header, 0).trim() || null : null,
        labels: rows.map((row) => cell(row, 0)),
        series,
      },
    };
  }

  if (numCols === 1) {
    if (!isNumericColumn(cells, 0)) {
      return { ok: false, reason: "Value is not numeric" };
    }

    const hasHeader = tryParseNumber(header[0]) === null;
    const title = hasHeader ? cell(header, 0) : null;
    const values = (hasHeader ? cells.slice(1) : cells).map((line) => tryParseNumber(line[0]));

    if (values.length < 2) {
      return { ok: false, reason: "Less than two rows" };
    }

    return {
      ok: true,
      data: {
        title,
        labels: null,
        series: [{ title, values: values.map((value) => value ?? 0) }],
      },
    };
  }

  const hasHeader = tryParseNumber(header[1]) === null;
  const rows = hasHeader ? cells.slice(1) : cells;

  if (rows.length < 2) {
    return { ok: false, reason: "Less than 2 rows" };
  }

  const invalidNumericColumn = rows.some((row) => tryParseNumber(row[1]) === null);
  if (invalidNumericColumn) {
    return { ok: false, reason: "Value is not numeric" };
  }

  const title = hasHeader ? cell(header, 1) : null;

  return {
    ok: true,
    data: {
      title,
      labels: rows.map((row) => cell(row, 0)),
      series: [{ title, values: rows.map((row) => numberAt(row, 1)) }],
    },
  };
}

/** Text copied from a spreadsheet (tab, comma or semicolon separated) as a chart's data. */
export function tryParseSpreadsheet(text: string): ParseSpreadsheetResult {
  function parseDelimitedLines(delimiter: "\t" | "," | ";") {
    return text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split(delimiter).map((value) => value.trim()));
  }

  // the delimiter giving the same, most columns on every line; among ties,
  // tab, then comma, then semicolon
  const candidates = (["\t", ",", ";"] as const).map((delimiter) => {
    const parsed = parseDelimitedLines(delimiter);
    const numCols = parsed[0]?.length ?? 0;
    const isConsistent = parsed.length > 0 && parsed.every((line) => line.length === numCols);
    return { parsed, numCols, isConsistent };
  });

  const best =
    candidates.find((candidate) => candidate.isConsistent && candidate.numCols > 1) ??
    candidates.find((candidate) => candidate.isConsistent) ??
    candidates[0];

  const lines = best?.parsed ?? [];
  const [first] = lines;

  if (!first) {
    return { ok: false, reason: "No values" };
  }

  if (!lines.every((line) => line.length === first.length)) {
    return { ok: false, reason: "All rows don't have same number of columns" };
  }

  return tryParseCells(lines);
}
