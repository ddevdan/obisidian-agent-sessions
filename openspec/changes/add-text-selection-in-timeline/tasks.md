## 1. Diagnose the cascade

- [x] 1.1 In the running app, inspect a `.claude-sessions-turn-body` text node's computed
  `user-select` / `-webkit-user-select` and find which Obsidian rule sets it to `none`
  (selector and origin stylesheet). Record the winning selector — it decides where the
  plugin's opt-in must sit (design.md, Open Questions).
- [x] 1.2 Confirm the same for the summary panel, system events panel, and search results
  panel, since they may sit under different containers.

## 2. CSS: enable selection on content

- [x] 2.1 Add a selection opt-in block to `styles.css` setting both `user-select: text` and
  `-webkit-user-select: text` on the plugin's view root containers (timeline container,
  summary panel, system events panel, search results), using a selector that out-specifies
  the rule found in 1.1.
- [x] 2.2 Audit every `cursor: pointer` selector under `claude-sessions-*` in `styles.css`
  and add `user-select: none` (+ `-webkit-` form) to any interactive chrome that lacks it —
  headers, toggles, icon buttons, copy/download buttons, filter and control bars.
- [x] 2.3 Verify code blocks, diff bodies, and ANSI-styled terminal output inherit the
  opt-in (no local `user-select` override, and inline ANSI color styles do not interfere).

## 3. Click guard in the plugin

- [x] 3.1 Add a selection-detection helper to `src/views/render-helpers.ts` that reports
  whether a non-collapsed selection is anchored inside a given container element, comparing
  both anchor and focus nodes.
- [x] 3.2 Extend `makeClickable()` to register a capture-phase `click` listener that calls
  `stopImmediatePropagation()` when the helper reports a selection inside the element's
  toggle container **and** `event.detail > 0` (pointer click, not synthetic/keyboard).
- [x] 3.3 Verify every `makeClickable()` call site attaches its own `click` handler *after*
  the `makeClickable()` call, so `stopImmediatePropagation()` can suppress it — check
  `timeline-renderer.ts`, `tool-renderer.ts`, `summary-renderer.ts`,
  `system-events-renderer.ts`, `timeline-view.ts`. Reorder any site that does not.
- [x] 3.4 Confirm the Enter/Space handler in `makeClickable()` still toggles while unrelated
  text is selected (the `event.detail` branch).

## 4. Click guard in the exported player

- [x] 4.1 Add the equivalent selection check at the top of the delegated `click` listener in
  `src/exporters/standalone-player.ts`, returning early for a selection-terminating pointer
  click before the mermaid / copy / collapsible branches.
- [x] 4.2 Add cross-reference comments on both the plugin helper and the player check noting
  the intentional duplication and that the two must stay in sync.
- [x] 4.3 Confirm the copy-button branch still runs (a copy-button click carries no
  selection anchored inside it).

## 5. Tests

- [x] 5.1 Unit-test the selection-detection helper against a stubbed `window.getSelection()`:
  collapsed selection, selection inside the container, selection in a sibling container,
  selection spanning container and outside.
- [x] 5.2 Unit-test the `makeClickable()` guard: pointer click with selection inside does
  not reach the downstream handler; pointer click without selection does; synthetic click
  (`detail === 0`) does.
- [x] 5.3 Run `npm test` and `npx eslint .` clean.

## 6. Manual verification

- [ ] 6.1 In Obsidian, verify each spec scenario in the timeline view: drag-select assistant
  text, double-click a word in tool output, select across ANSI terminal output, select a
  summary value and a system events entry, select a search result snippet — each selects
  and copies the visible text.
- [ ] 6.2 Verify drag starting on a turn header selects nothing and still toggles on release;
  verify a selection drag whose click reaches a header leaves the block expanded and the
  selection intact; verify a plain header click still toggles.
- [ ] 6.3 Export a session to HTML, open it in a browser, and repeat 6.1 and 6.2 there.
- [ ] 6.4 Export a session to Markdown and confirm no regression (no selection concern, but
  the export path shares renderer code).

## 7. Documentation

- [x] 7.1 Add a `GOTCHAS.md` entry: Obsidian disables text selection in custom views by
  default; the plugin opts in at the view root and opts chrome back out.
- [x] 7.2 Add a `GOTCHAS.md` entry: `makeClickable()` installs a capture-phase click guard,
  so per-element `click` handlers must be attached after it.
- [ ] 7.3 Add a `COMPATIBILITY.md` note that the selection opt-in depends on Obsidian's own
  selection rule and should be re-checked against new Obsidian releases.
- [x] 7.4 Add a `CHANGELOG.md` entry under the next version.
