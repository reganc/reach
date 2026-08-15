// Chart palette for the Insights view. Reach is dark-only; these are the
// dark-mode categorical steps validated against the card surface
// (hsl(240 6% 8%) ≈ #131316) — all adjacent-pair CVD and contrast checks pass.
// Assign slots in this fixed order, never cycled; series 7+ fold into "Other".

export const SERIES_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
] as const

/** The "Other" bucket and de-emphasis marks — muted, never a series hue. */
export const OTHER_COLOR = "#898781"

/** Single-hue slot for magnitude-only charts (focus share, sparkline accent). */
export const SEQUENTIAL_HUE = "#3987e5"

export const MAX_NAMED_SERIES = SERIES_COLORS.length

/** Chart chrome — matched to reach's theme tokens. */
export const CHART = {
  surface: "hsl(240 6% 8%)",
  grid: "hsl(240 4% 14%)",
  axis: "hsl(240 4% 20%)",
  ink: "hsl(0 0% 95%)",
  inkMuted: "hsl(240 5% 55%)",
} as const
