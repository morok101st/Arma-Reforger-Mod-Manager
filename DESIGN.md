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

## Mod details (phase three)

Lead with the mod name and a 16px Workshop ID with an adjacent icon that copies the raw ID as text and briefly confirms success, followed by labeled Workshop and Check updates actions. Installed and latest versions have a single comparison area with persistent status. Refresh progress and save confirmation appear without replacing that status. The installed-version editor is shown only to writers; JSON copy remains available to readers when an installed version exists. Clipboard failures are visible and retryable.

Description, dependencies and Required by follow. Tracked dependencies remain navigable; untracked dependencies remain plain labels. Changelog entries expose expanded state and their content region. Technical metadata is a compact definition list directly under the mod name and Workshop ID, without a repeated latest version. Remove mod sits beside the upper actions with a subtle danger treatment and separation from routine controls. It is shown only to writers and preserves dependency safeguards and explicit follow-up choices.

The layout collapses from paired relationship columns to a single column on phones; long names and IDs wrap. No backend/API or dependency semantics change.

## Modset management (phase four)

Search by name or owner; filter all, owned or group-access modsets. Desktop rows separate name, owner, access, mod count and actions. The name is an explicit workspace link; rows do not nest buttons inside another interactive control. Active selection is labeled. Edit and Export stay visible; Duplicate and Delete use a secondary actions disclosure. Readers retain copy/export, the last-modset safeguard and delete confirmation remain.

At narrower widths the same rows become labeled stacked records; phone actions stack at full width. The edit dialog stages name and permissions in one save, with native keyboard-accessible permission selects, optional group search and retry after a permission-loading failure. Filtering groups never removes staged or existing grants. Errors remain visible inside create/delete dialogs.

## Administration (phase five)

Replace the Security feed with focused Users, Groups, Discord and Audit log sections. A left section navigator becomes a four-item grid on smaller screens. Only the selected section renders. Personal Account settings are reached independently through the account menu; regular users see only their own account settings.

Users and groups have local search. Membership editors preserve selections while filtering members. User, password and webhook form errors stay visible in dialogs. Role, session, OIDC, membership and webhook-scope APIs retain their semantics. Webhook dialog drafts initialize when opened, so background list reloads cannot overwrite selected modsets. Account session information uses a compact summary instead of metric cards. Audit filters expose selection state; refresh and paging remain available. Phone actions stack consistently.
