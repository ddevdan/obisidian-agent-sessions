## Why

Session content rendered by the plugin's views cannot be selected with the mouse, so users
cannot copy an assistant reply, a command output line, or part of a diff out of a session
they are reading. Obsidian's desktop chrome disables text selection by default and the
plugin's views never re-enable it, which makes the viewer read-only in the most literal
sense: you can see the text but you cannot take it with you.

## What Changes

- Session content inside every plugin-owned view (timeline turns, tool blocks, thinking
  blocks, summary dashboard, system events panel, search results) becomes selectable with
  mouse drag, double-click word select, and `Cmd/Ctrl+A`-within-block, and copyable with
  the platform copy shortcut.
- Interactive chrome stays non-selectable: collapsible headers, toggle buttons, filter
  controls, and icon buttons keep `user-select: none` so a drag that starts on a header
  does not paint a selection instead of expanding the block.
- Toggle handlers stop firing when the click that reaches them is the terminating click of
  a text selection, so dragging across content does not collapse the block being read.
- Existing copy-to-clipboard buttons remain unchanged; manual selection is additive, not a
  replacement.

## Capabilities

### New Capabilities
- `session-viewer/text-selection`: what a user can select and copy while reading a session
  in a plugin view, and which regions are deliberately excluded from selection.

### Modified Capabilities
<!-- None. No existing spec under openspec/specs/ covers viewer interaction. -->

## Impact

- `styles.css` — selection rules for the plugin's view containers and the interactive
  elements that opt out.
- `src/views/render-helpers.ts` — shared guard helper for toggle click handlers.
- `src/views/timeline-renderer.ts`, `src/views/tool-renderer.ts`,
  `src/views/summary-renderer.ts`, `src/views/system-events-renderer.ts`,
  `src/views/timeline-view.ts` — toggle handlers adopt the guard.
- `src/exporters/css-capture.ts` output — exported HTML inherits the new rules; the
  standalone player's toggle behavior must stay consistent with the in-app behavior.
- No parser, API, or data-format change. No new dependency.
