import type { ChartType } from "@excalidraw/element/types";

import type { RenderEnvironment } from "@excalidraw/element";

import { renderBarChart } from "./bar.ts";
import { renderLineChart } from "./line.ts";
import { tryParseCells, tryParseNumber, tryParseSpreadsheet } from "./parse.ts";
import { renderRadarChart } from "./radar.ts";

import type { ChartElements, Spreadsheet } from "./types.ts";

export {
  type ParseSpreadsheetResult,
  type Spreadsheet,
  type SpreadsheetSeries,
  type ChartElements,
} from "./types.ts";

export { isSpreadsheetValidForChartType } from "./helpers.ts";
export { tryParseCells, tryParseNumber, tryParseSpreadsheet };

export const renderSpreadsheet = (
  chartType: ChartType,
  spreadsheet: Spreadsheet,
  x: number,
  y: number,
  colorSeed?: number,
  renderEnvironment?: RenderEnvironment,
): ChartElements | null => {
  if (chartType === "line") {
    return renderLineChart(spreadsheet, x, y, colorSeed, renderEnvironment);
  }
  if (chartType === "radar") {
    return renderRadarChart(spreadsheet, x, y, colorSeed, renderEnvironment);
  }
  return renderBarChart(spreadsheet, x, y, colorSeed, renderEnvironment);
};
