## Context

See `proposal.md` — Why.

Current state that shapes the approach:

- Obsidian's desktop app stylesheet disables text selection on the app chrome. Custom
  `ItemView` content inherits that, and nothing under `.claude-sessions-*` re-enables it,
  so the timeline reads as unselectable. The reading and editing views work only because
  Obsidian re-enables selection for them explicitly.
- `styles.css` already carries ten `user-select: none` declarations. All ten sit on
  interactive chrome (collapsible headers, show-more toggles). None sit on content, so the
  fix is additive rather than a removal.
- Collapse/expand is driven by CSS class toggling (`open`, `collapsed`, `is-collapsed`),
  not display manipulation — see `CLAUDE.md` conventions. Toggle handlers are attached
  per-element across `timeline-renderer.ts`, `tool-renderer.ts`, `summary-renderer.ts`,
  `system-events-renderer.ts`, and `timeline-view.ts`.
- `makeClickable()` in `render-helpers.ts` is the single shared entry point already applied
  to every clickable header, so it is the natural seam for cross-cutting click behavior.
- Exported HTML re-uses the captured plugin stylesheet plus one delegated `click` listener
  in `standalone-player.ts` (`toggleCollapsible`, `toggleShowMore`). Both the CSS and the
  guard must land in a form the export path picks up.
- The project forbids inline styles and `innerHTML` in the renderer pipeline, so all
  selection rules belong in `styles.css`.

## Goals / Non-Goals

**Goals:**

- One CSS rule pair (enable on view roots, opt out on chrome) rather than per-block rules,
  so newly added blocks are selectable by default.
- One shared click guard rather than an edit to each of the ~20 toggle handlers.
- In-app and exported-HTML behavior stay in sync by construction, not by parallel edits.

**Non-Goals:**

- Cross-turn "select the whole session" affordances or a select-all command.
- Copying with structure preserved (Markdown round-trip). Plain visible text is enough;
  the existing copy buttons already cover structured copy.
- Mobile/touch selection tuning. The plugin is desktop-only.
- Changing what the existing copy buttons copy.

## Decisions

### 1. Enable selection at the view root, opt out on chrome — not per content block

Add `user-select: text` to the plugin's view root containers (timeline container, summary
panel, system events panel, search results) and keep `user-select: none` on the existing
chrome selectors. Selection inherits, so every current and future content block is
selectable without further work.

Alternative considered: annotate each content block (`.claude-sessions-turn-body`,
`.claude-sessions-tool-result`, …) with `user-select: text`. Rejected — it is a growing
list, and a block added later silently regresses.

Trade-off accepted: a chrome element that does not yet carry `user-select: none` becomes
selectable. That is a cosmetic regression, discoverable by inspection, and the audit of
chrome selectors is part of the task list.

### 2. `-webkit-user-select` alongside `user-select`

Electron's Chromium honors the unprefixed property, but Obsidian's own rules use the
prefixed form and specificity ties are resolved by source order. Emit both to avoid a
cascade surprise where Obsidian's prefixed `none` wins over the plugin's unprefixed
`text`.

Alternative considered: unprefixed only, verified empirically. Rejected as a fragile bet
against a stylesheet the plugin does not control.

### 3. Guard toggles on selection state inside `makeClickable()`

`makeClickable()` already wraps every collapsible header. Extend it to install a `click`
listener in the capture phase that calls `stopImmediatePropagation()` when
`window.getSelection()` reports a non-collapsed range whose anchor lies inside the
element's block. Existing per-element handlers stay untouched.

Rationale: one edit, applies retroactively to every header that already calls
`makeClickable()`, and it cannot be forgotten by a future renderer.

Alternatives considered:

- Guard inside each toggle handler — ~20 edits, easy to miss one.
- Suppress on `mousedown`/`mouseup` distance instead of selection state — reimplements what
  the selection API already reports, and misbehaves for double-click selection.

Detail: the capture-phase listener must be registered on the same element and before the
per-element handler, because `stopImmediatePropagation()` only blocks listeners registered
later on the same node in the same phase. `makeClickable()` is called before
`addEventListener('click', …)` at every current site — this ordering becomes a documented
requirement in `GOTCHAS.md`.

Detail: the guard checks the selection only for pointer-driven clicks. The existing
Enter/Space handler calls `el.click()`, which produces a synthetic click that must still
toggle even while unrelated text is selected. Distinguish them by `event.detail > 0`
(a real pointer click) versus `0` (synthetic/keyboard).

### 4. Mirror the guard in the standalone player's delegated handler

`standalone-player.ts` has one delegated `document` click listener. Add the same
selection check at its top, before the mermaid/copy/collapsible branches, and return early
when the click terminates a selection. The copy-button branch is unaffected because a copy
button click never carries a selection anchored inside it.

Alternative considered: sharing one guard function between plugin and player. Rejected —
the player is an embedded string with no module boundary to the plugin source; duplicating
six lines is cheaper than inventing a shared-code channel. The duplication is flagged with
a comment on both sides.

### 5. Scope the "selection is inside this block" test to the clickable element itself

Compare against the clickable element, not the document and not its parent container. A
selection made in turn 3 must not block the reader from collapsing turn 7, and a selection
in one search result row must not block clicking a sibling row — which checking the parent
container would do.

Test: a non-collapsed selection whose **anchor or focus** node is contained by the clickable
element. Checking both ends covers the two gestures that can end with a click on the
element: selecting text inside it (a clickable whose own subtree is selectable, such as a
search result row), and dragging upward out of a sibling body onto its header, where the
anchor stays in the body and the focus lands in the header.

Checking `el` rather than the toggle container is sufficient because a drag that starts and
ends in different elements fires `click` on their nearest common ancestor — for a header/body
pair that ancestor is the block, not the header, so such a click never reaches the header's
handler at all.

## Risks / Trade-offs

- **Obsidian's selection-disabling rule changes shape in a future release, and the new rule
  out-specifies the plugin's** → Rules live in one place in `styles.css`; the manual
  verification step in `tasks.md` covers a fresh Obsidian version, and `COMPATIBILITY.md`
  gets a note.
- **Chrome element missing `user-select: none` becomes selectable** → Task list includes an
  audit sweep of every `cursor: pointer` selector under `claude-sessions-*` for a matching
  selection opt-out.
- **Guard suppresses a legitimate toggle** — reader selects text, then clicks a header
  expecting a toggle, and the first click only clears the selection → Matches native
  browser and editor behavior for the same gesture; the second click toggles. Accepted.
- **Selection anchored in the header itself (because chrome opt-out is missing there)
  permanently blocks that header's toggle** → Same audit mitigation as above; the
  `event.detail` check keeps keyboard activation working as an escape hatch.
- **Exported HTML and in-app behavior drift** because the guard is duplicated → Both sites
  carry a cross-reference comment, and the task list verifies the exported artifact
  explicitly rather than assuming CSS capture is sufficient.
- **ANSI-rendered output uses inline styles** (the one documented exception to the
  no-inline-styles rule) → Inline styles set color only, not `user-select`, so the
  inherited rule applies. Verified as a scenario in the spec.

## Migration Plan

None required. Behavior-only change, no persisted data or settings. Rollback is reverting
the commit; no state is written.

## Open Questions

- ~~Whether Obsidian's own selection rule targets `body` or a `.workspace` descendant
  determines which container the plugin's `user-select: text` must sit on for the cascade
  to land.~~ **Resolved**: `app.css` sets it on `body` (element specificity, no
  `!important`), so any `.claude-sessions-*` class selector out-specifies it. Confirmed in
  a browser against a harness that reproduces the same `body` rule.
