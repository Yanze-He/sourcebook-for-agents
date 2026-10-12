export const PICKER_OVERLAY_POSITION_KEY = "pickerOverlayPosition";

export const pickerOverlayPositions = ["top-right", "bottom-right", "bottom-left", "top-left"] as const;
export type PickerOverlayPosition = typeof pickerOverlayPositions[number];

export const DEFAULT_PICKER_OVERLAY_POSITION: PickerOverlayPosition = "top-right";

export function storedPickerOverlayPosition(value: unknown): PickerOverlayPosition {
  return typeof value === "string" && pickerOverlayPositions.includes(value as PickerOverlayPosition)
    ? value as PickerOverlayPosition
    : DEFAULT_PICKER_OVERLAY_POSITION;
}
