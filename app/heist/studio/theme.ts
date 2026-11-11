// "Heist noir": the AG Studio theme for the Heist cockpit.
// Colors come from app/heist/heist-theme.ts, so the shell and Studio stay one palette.

import { studioTheme } from "ag-studio";
import { heistColors as c } from "@/app/heist/heist-theme";

const FONT = 'Archivo, "Arial Narrow", system-ui, sans-serif';
const line = (color: string) => ({ width: 1, color });

// Chart series, in order: gold first (money), then the status colors.
const series = [c.gold, c.danger, c.success, c.info, c.warning, "#B49BD8", "#7FC7C4", "#D88FB0", "#9FB07A", "#C9C2B3"];
const palette = Object.fromEntries(
  series.flatMap((color, i) => [
    [`chartPaletteFills${i + 1}Color`, color],
    [`chartPaletteStrokes${i + 1}Color`, color],
  ]),
);

export const heistNoirTheme = studioTheme.withParams({
  fontFamily: FONT,
  fontSize: 14,
  textColor: c.text,
  foregroundColor: c.text,
  subtleTextColor: c.textMuted,
  backgroundColor: c.surface,
  borderColor: c.border,
  accentColor: c.gold,
  iconColor: c.textMuted,
  rowHoverColor: c.surfaceRaised,

  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: c.background,
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: c.background,
  studioCanvasPadding: 16,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: FONT,

  studioWidgetBackgroundColor: c.surface,
  studioWidgetBorder: line(c.border),
  studioWidgetBorderRadius: 8,
  studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: FONT,
  studioWidgetTitleFontSize: 13,
  studioWidgetTitleFontWeight: 700,
  studioWidgetTitleTextColor: c.gold,
  studioWidgetSubtitleFontFamily: FONT,
  studioWidgetSubtitleFontSize: 12,
  studioWidgetSubtitleTextColor: c.textMuted,
  studioWidgetCaptionFontFamily: FONT,
  studioWidgetCaptionFontSize: 12,
  studioWidgetCaptionTextColor: c.textMuted,
  studioWidgetResizeBorderColor: c.gold,

  studioPanelContainerBackgroundColor: c.surface,
  studioPanelContainerBorder: line(c.border),
  studioPanelContainerBorderRadius: 0,
  studioPanelDividerColor: c.border,
  studioPanelDividerActiveColor: c.gold,
  studioPanelSectionBorderColor: c.border,
  studioPanelHeaderFontFamily: FONT,
  studioPanelHeaderFontWeight: 700,
  studioPanelChevronButtonHoverBackgroundColor: c.surfaceRaised,
  studioPanelChevronButtonHoverColor: c.gold,
  studioToggleButtonActiveBackgroundColor: c.surfaceRaised,
  studioToggleButtonActiveBorderColor: c.gold,
  studioToggleButtonActiveColor: c.gold,

  // Forensics Analyst panel: wide enough to read, square inputs, chalk message bubbles, yellow primary button.
  studioAiPanelWidth: 440,
  studioAiPanelInputMessageBackgroundColor: c.surfaceRaised,
  studioAiPanelRichTextAccentBackgroundColor: c.surfaceRaised,
  studioAiPanelButtonHoverBackgroundColor: c.surfaceRaised,
  inputBackgroundColor: c.background,
  inputTextColor: c.text,
  inputPlaceholderTextColor: c.textMuted,
  inputBorder: line(c.border),
  inputFocusBorder: line(c.gold),
  inputBorderRadius: 0,
  buttonBackgroundColor: c.gold,
  buttonTextColor: c.background,
  buttonBorder: line(c.gold),
  buttonHoverBackgroundColor: c.text,
  buttonHoverTextColor: c.background,
  buttonHoverBorder: line(c.text),
  buttonBorderRadius: 0,
  buttonFontWeight: 700,

  gridFontFamily: FONT,
  gridFontSize: 13,
  gridCellTextColor: c.text,
  gridHeaderBackgroundColor: c.surface,
  gridHeaderTextColor: c.textMuted,
  gridHeaderFontWeight: 700,
  gridHeaderFontSize: 12,
  gridRowHeight: 36,
  gridRowBorder: line(c.border),
  gridHeaderRowBorder: line(c.border),
  gridPinnedRowBorder: line(c.border),
  gridRowHoverColor: c.surfaceRaised,
  gridWrapperBorder: false,

  chartFontFamily: FONT,
  chartTextColor: c.text,
  chartSubtleTextColor: c.textMuted,
  chartAxisLineColor: c.border,
  chartGridLineColor: c.border,
  ...palette,
});
