/**
 * Shared chart color tokens for the Gold & Onyx theme.
 *
 * CHART_COLORS is a fixed-order categorical palette validated against the
 * #171717 chart surface (dataviz skill's six-check validator: lightness
 * band, chroma floor, CVD separation, normal-vision floor, contrast — all
 * pass). Assign slots in order for multi-series charts; never reorder or
 * cycle. Single-series charts should use CHART_COLORS[0] (brand gold) alone.
 */
export const CHART_COLORS = [
  "#B4832B", // 1 gold (brand)
  "#3987e5", // 2 blue
  "#d95926", // 3 orange
  "#199e70", // 4 aqua
  "#9085e9", // 5 violet
  "#d55181", // 6 magenta
  "#008300", // 7 green
  "#e66767", // 8 red
] as const;

export const CHART_CHROME = {
  surface: "#171717",
  grid: "rgba(255, 255, 255, 0.08)",
  axis: "rgba(255, 255, 255, 0.16)",
  axisText: "#A8A29A",
  tooltipBg: "#1F1F1F",
  tooltipBorder: "rgba(255, 255, 255, 0.12)",
  tooltipText: "#F5F0E6",
  tooltipShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
} as const;
