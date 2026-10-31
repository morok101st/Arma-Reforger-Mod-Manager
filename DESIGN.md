# ARMM design foundations

## Direction

A task-focused modset workspace. Phase one establishes shared visual foundations; navigation and page composition follow later. Preserve product behavior and English terminology.

## Palette

Dark surfaces: #141414, #181818, #1a1a1a, #242424. Primary action: #ffce3a with dark text. Text: #eeeeec; secondary: #b0b0ac. Existing semantic status colors remain. Light mode retains its green accent.

## Typography

Established Roboto/Noto Sans/Segoe UI stack. Body: 15px/1.5. Page headings: 24–32px, weight 600. Section headings: 18px, weight 600. Controls: weight 600. Tabular numerals in metrics and export order.

## Spacing and shape

Spacing scale: 4, 8, 12, 16, 24, 32px. Corners: controls 8px, panels 12px, dialogs 16px. Fields 42px high; mobile dialog actions at least 44px. Quiet flat workspace header. Dialogs scroll within the viewport.

## Interaction

Visible accent focus outlines, hover states, themed selection and caret colors, reduced-motion support. Primary buttons stay still on hover. Complete keyboard interaction for dialogs and selects follows in the component phase.

## Review scope

Desktop/mobile and both themes. This documents phase one, not completion of the full redesign.

## Workspace and navigation (phase two)

A global header carries the logo, labeled Workspace/Modsets/Administration navigation and a separate account menu. Regular users see Settings in place of Administration. Repeated navigation stays on the selected section. Management pages use the full content width.

The desktop workspace has a 310px mod browser and flexible detail area. A sticky context toolbar owns the active modset selector and Export JSON, Edit modset and Add mod actions. Edit reuses the existing combined name/permissions dialog. Export remains available to readers; editing and adding require write access.

The mod browser prioritizes search, an overview link, result count and mod list. Status and sorting controls are expandable; an active status filter remains visible. Zero dependency counts are omitted. Version-health summaries filter the browser, clear search and open the mobile drawer. Up-to-date is now a supported filter.

Below 900px the browser becomes a closable drawer. Global navigation remains visible, actions wrap and management stays full width. The drawer closes on mod selection, its close button, backdrop or Escape. At 600px and below, navigation icons stack above labels.

The remaining administration subsection split, mod-detail redesign and full shared-component keyboard pass belong to later phases.
