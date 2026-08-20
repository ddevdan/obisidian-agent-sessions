# Changelog

All notable changes to Agent Sessions are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [Semantic Versioning](https://semver.org/).

For agent transcript format compatibility, see [COMPATIBILITY.md](COMPATIBILITY.md).

---

## [Unreleased]

### Added
- **pi sessions are now readable** — the plugin reads transcripts from [pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) as well as Claude Code. pi's default location (`~/.pi/agent/sessions`) is scanned out of the box, and a configured directory that does not exist is skipped silently, so nothing changes for readers who do not use pi

  pi's record types map onto the existing turn and content-block model: reasoning becomes thinking blocks, `toolCall` becomes tool calls with their arguments, `toolResult` attaches to its call via `toolCallId` with failures marked, and `bashExecution` becomes a command block carrying its command, output and exit status. Consecutive assistant records merge into one turn, as with Claude Code

  The blocker was never parsing — it was discovery. Content detection set `hasContent` only for a top-level `"type":"user"`/`"type":"assistant"`, which is Claude Code's shape; pi nests the role at `message.role`, so every pi session was judged empty and dropped *before* format detection ran. The feature looked absent rather than broken. Detection now goes through per-format probes (`parsers/format-probes.ts`) that every format contributes to

  Probes are two-tiered, because measurement showed a single tier cannot work: Claude Code writes its top-level `type` at a median offset of **1146** characters and up to 48KB into the line, so 62% of its conversation records carry no `type` within any sensible head budget — a head-only content check produced 29,768 false negatives across the corpus. Correctness-critical checks therefore read an already-parsed record, and only the whole-file last-prompt sweep uses a 200-character head, where a miss degrades to the file mtime. Verified over 76,638 Claude and 944 pi records with zero false positives, zero false negatives, and no cross-firing between formats

  pi sessions report **the cost pi itself recorded**, never a figure computed here. Its models are not Anthropic — `gpt-5.6-sol` and `deepseek-v4-pro` observed — and `getPricing()` silently falls back to Sonnet rates for anything unrecognised, which on a 4.6M-token session would be wrong by orders of magnitude. `SessionStats.costSource` now distinguishes `recorded` from `computed`, with `unknown` meaning no cost is shown at all rather than a misleading zero

  Also format-aware now: the resume command, which previously offered `claude --resume` for every session. pi uses `pi --session <id>`

  pi session names are read too. pi stores a user-set name as a `session_info` entry (`pi --name "..."`, or `setSessionName()` from an extension); the latest entry wins and a blank name is an explicit clear, matching pi's own resolution. It maps to `customTitle` — the same provenance as Claude Code's `/rename` — so the existing three-tier display-name resolution needed no pi-specific branch. pi has no auto-generated title, so an unnamed session still shows its project name

- **Session titles in the browser and search panels** — Claude Code names every session it can, and shows that name in its own `/resume` picker. The plugin was throwing the name away: `ai-title` was listed in both `SKIP_RECORD_TYPES` and `SKIP_TYPE_STRINGS`, so it got discarded as metadata noise

  The session browser and the search panel now show the real title — `Fix re-entrancy bug in switchToNote` instead of `ankihub`. That matters most in a monorepo or a busy project, where every session previously displayed the same project name and the picker gave you nothing to tell them apart. The browser's filter also matches on any of a session's names, not just the one on display, so typing a remembered title finds it

  Titles resolve in three tiers, in one place (`utils/session-title.ts`): `customTitle` from `/rename` wins, then `aiTitle`, then the project name. `ai-title` records are emitted repeatedly as a session evolves, so the last one wins. Roughly half of sessions carry a title — short ones never get one generated, and those still show the project name as before. The summary panel, both exporters, and distill frontmatter use the same resolution, and only print a "Title:" row when a real title exists rather than repeating the adjacent Project value

  `custom-title` support is retained for older sessions but appears to be gone from current Claude Code — zero occurrences across a 361-session corpus spanning 2.1.215–2.1.235. Every surface had been falling back to the project name for every session as a result

  The session index cache version is bumped to 3, so already-indexed sessions are re-read once to pick up their titles

### Changed
- **BREAKING — the plugin is now called Agent Sessions**, and registers a provider-neutral `obsidian://agent-sessions` protocol scheme. It no longer claims to serve a single agent

  **Existing links keep working.** The `obsidian://claude-sessions` scheme stays registered permanently, not deprecated: the plugin writes those links into distilled notes and exported artifacts it does not own and cannot rewrite, and external scripts use them too, so there is no mechanism by which a deprecation could reach them. New links are minted under the neutral scheme

  Two identifiers deliberately did **not** move, because both are contracts rather than copy. The plugin **id** stays `claude-sessions` — Obsidian keys installed plugins, their settings directory and `app.plugins.plugins['claude-sessions']` by it, so renaming would orphan your settings and break every API consumer. The **`claude-sessions-*` CSS prefix** stays because `THEMING.md` publishes it as the surface user snippets target, across 498 selectors. Install paths and the plugin folder are unchanged as a result

  The session index cache version is bumped to 5: entries cached before this release were written when a pi transcript was judged empty, so they must be re-read or pi sessions stay hidden

- **Sessions are ordered by when you last prompted them, not by file mtime** — the session browser and search panel sorted on the file's modification time, which drifts away from your last prompt. Background writes keep touching a session file after you stop typing: title regeneration, file-history snapshots, subagent activity. Measured over a 361-session corpus, mtime ordering and last-prompt ordering agreed on only **14%** of positions, with drift reaching days. One real session was last prompted at 17:29 but written at 19:36 — under the old sort it outranked sessions touched far more recently

  The sort key is the timestamp of the last user record, resolved in `utils/session-order.ts`, with mtime kept as the fallback for a session that has no user record. Coverage is 100% of sessions with content

  Claude Code's own `last-prompt` record was the obvious source but is unusable as a key: it carries no timestamp, and its `leafUuid` points at any record type (usually `system`), so resolving it would mean building a uuid→timestamp map over every line — the full-parse cost the metadata scan exists to avoid. The last user record's timestamp agrees with it to a median of 26 seconds while covering 100% of sessions instead of 76%. The timestamp is pulled with a narrow regex after a head-only type check, verified against a full parse across the corpus at 360/360 exact with no false matches

  The session index cache version is bumped to 4 to re-read already-indexed sessions

### Fixed
- **Tables with unpiped body rows rendered as a paragraph** — model-authored tables sometimes pipe the header and delimiter rows but not the body:

  ```
  | Test | Output | Finding |
  |---|---|---|
  `test_name` | `assert 2.01 < 1.5` | prep phase unbounded |
  ```

  Obsidian closes the table after the delimiter row, so the body rendered as flowing text with the pipes showing as literal characters and the cells as inline code. `normalizeMarkdown()` now gives those rows the leading pipe they are missing. A row is only adopted if it carries at least `columns - 1` pipes, so prose that merely happens to contain a pipe closes the table instead of being pulled into it. Roughly 4% of tables in a real corpus have this shape

- **Blank-line insertion corrupted fenced code blocks** — the rule that separates a table from the paragraph above it was a plain regex with no awareness of code fences, so a table-shaped block inside a fence had a blank line injected into it, breaking the fence and the code it displayed. Both table repairs now run in a single fence-aware pass that skips fenced content entirely. Measured over a 361-session corpus the old rule corrupted fenced code in 6 text blocks; the new one in none

  The pass also now recognises tables written without outer pipes (`a | b` over `--- | ---`), which the old regex required to start and end with a pipe

- **Session text could not be selected or copied** — Obsidian's `app.css` sets `user-select: none` on `body` and `user-select` inherits, so everything the plugin rendered was unselectable. You could read an assistant reply or a line of command output but not drag across it, and the copy buttons were the only way to get text out

  Each view root (`.claude-sessions-timeline-container`, `.claude-sessions-search-view`) now opts back in with `user-select: text`, so message text, thinking blocks, tool input and results, diffs, ANSI terminal output, summary values, system events, and search snippets are all selectable and copyable. Interactive chrome opts back out: the 16 clickable elements that were missing a selection opt-out (copy and download buttons, control-bar buttons, the compaction header, image thumbnails, mermaid containers, search buttons) now carry one, so a drag that starts on a header still expands the block instead of painting a selection

  `makeClickable()` also installs a capture-phase click guard, so the click that ends a drag-select no longer collapses the block you were reading — the block stays open and the selection survives. Keyboard activation is unaffected: Enter and Space still toggle while text is selected. The same guard is mirrored in exported HTML

---

## [0.3.18] - 2026-08-02

### Fixed
- **Cache-write costs understated on long sessions** — Anthropic bills a prompt-cache write at 1.25x the input rate for the 5-minute TTL but 2x for the 1-hour TTL. Every cache write was priced at 1.25x, so any session using the 1-hour cache read low. Claude Code has used the 1-hour cache for the whole conversation for some time now, which means the error applied to the entire cache-write total rather than a fraction of it. On a 114k cache-write session the reported cost moved from $6.25 to $6.68

  `MODEL_PRICING` now carries `cacheWrite5m` and `cacheWrite1h` per model family, and the parser reads the `cache_creation.ephemeral_1h_input_tokens` breakdown that Claude Code records alongside the flat `cache_creation_input_tokens` total. Sessions from older versions that carry no breakdown still bill entirely at the 5-minute rate, unchanged from before. Token counts and context-window figures are unaffected — only the cost math changed

  Note that Claude Code's own `/config` → Usage panel can disagree, and says so: when it shows "costs may be inaccurate due to usage of unknown models" it has no price entry for the model in use and falls back to Sonnet rates. On the session above it reported $4.01, which is Sonnet pricing applied to Opus tokens

---

## [0.3.17] - 2026-07-25

### Fixed
- **Community scanner: `prefer-create-el`** — `activeDocument.createDocumentFragment()` replaced with Obsidian's `createFragment()` helper in the search view result cache and the timeline summary refresh
- **Community scanner: deprecated `setWarning`** — the session directory removal button now uses `setDestructive()`; same styling, non-deprecated spelling. Requires 1.10.0+, already covered by the 1.13.0 `minAppVersion`
- **Community scanner: CSS compat** — closes out the `text-decoration` back-and-forth from 0.3.12 and 0.3.14. Neither the shorthand nor the longhands clear the compat lint, so the declaration is gone entirely, along with the `color`/`:hover` rules beside it: the WebFetch URL is a plain `<a>`, so Obsidian's built-in anchor styling already supplied all three. The removed shorthand carried an unresolved `var(--link-decoration-color)` that invalidated it at computed-value time anyway, meaning the underline it named was never actually rendering. Themes setting `--link-decoration: none` are now respected

---

## [0.3.16] - 2026-07-25

### Added
- **AskUserQuestion option previews** — the `preview` field on each option (ASCII mockups, code samples, layout comparisons) was parsed but never rendered. Each option with a preview now gets a collapsible disclosure under its description, auto-opened for the option the user selected. Previews render preformatted rather than as markdown, because a markdown pass collapses the whitespace that ASCII art depends on and reinterprets `---`/`#`/`*` as block syntax. Included in Markdown and HTML exports

### Fixed
- **Blank assistant turns** — a text block opening with `---` was read by `MarkdownRenderer` as a YAML frontmatter delimiter, swallowing everything up to the next `---`. The turn rendered empty while its "Show more (N lines)" button still reported the full line count. `normalizeMarkdown()` now rewrites a leading `---` to the equivalent `***` thematic break; setext heading underlines and longer dash runs are left alone
- **Markdown normalization coverage** — thinking blocks, slash-command output, and compaction summaries rendered raw text through `MarkdownRenderer` and shared the same latent frontmatter bug; all now go through `normalizeMarkdown()`
- **`file-history-delta`, `agent-color`, and `pr-link` record types** — three metadata-only records were triggering "unknown record type" warnings. Added to both `SKIP_RECORD_TYPES` and `SKIP_TYPE_STRINGS` so they are also excluded from search and streaming

---

## [0.3.15] - 2026-07-13

### Fixed
- **Inline code wrapping** — the 0.3.13 fix did not take effect. Obsidian's `.markdown-rendered :not(.print) code` rule (specificity 0,2,1) outweighed it, so `white-space: pre-wrap` and `word-break: break-all` never applied. Now scoped through `.claude-sessions-block-wrapper .claude-sessions-text-block` for specificity 0,3,1

---

## [0.3.14] - 2026-07-13

### Fixed
- **Community scanner: CSS compat** — reverted the `text-decoration` longhand split from 0.3.12; the scanner warns on both the shorthand and the longhands, and the shorthand is the smaller surface

---

## [0.3.13] - 2026-07-13

### Changed
- **Declarative settings** — migrated settings tab from imperative `display()` to Obsidian 1.13.0 `getSettingDefinitions()` API; settings are now searchable in global settings search
- **Folder pickers** — replaced custom `FolderSuggest` with built-in `folder` control type
- **Session directory delete** — now shows a `ConfirmationModal` before removing a directory
- **Bump `minAppVersion`** to 1.13.0

### Fixed
- **Inline code overflow** — long URLs and paths in inline `<code>` elements in user and assistant turns now wrap instead of overflowing (this did not actually take effect — see 0.3.15)

### Removed
- `FolderSuggest` utility (`utils/folder-suggest.ts`) — superseded by built-in folder control

---

## [0.3.12] - 2026-07-13

### Fixed
- **Context total dropping after compaction** — the Context hero card total (`contextWindowTokens + cumulativeDroppedTokens`) could decrease after compaction because the two values used different token counting bases; now computes cumulative dropped using our own cache-aware context measure instead of Claude Code's `compact_boundary` metadata
- **Peak context underreported** — peak now uses cache-aware context window size at compaction time instead of Claude Code's `preTokens` value
- **Community scanner: cross-window instanceof** — `instanceof HTMLElement` replaced with `.instanceOf(HTMLElement)` in mermaid preview modal
- **Community scanner: CSS compat** — `text-decoration` shorthand split into `text-decoration-line` + `text-decoration-color` longhands

---

## [0.3.11] - 2026-07-13

### Fixed
- Community scanner type-safety and CSS warnings

---

## [0.3.10] - 2026-07-11

### Added
- **WebFetch rendering** — clickable URL link + prompt text with copy button instead of raw JSON; result body renders with code/preview markdown toggle
- **Context compaction stats** — Context hero card now shows full context footprint (current + dropped tokens) with compaction subtitle (e.g. "Peak: 181.6k · 2× compacted")

### Fixed
- **`mode` and `ai-title` record types** — new Claude Code per-turn metadata records are now skipped instead of triggering unknown record type warnings
- **Context hero card during rate limit** — summary dashboard no longer loses the context/token count card when session usage hits 100%; rate-limit placeholder records with all-zero tokens no longer zero out the context window stat
- **AskUserQuestion embedded quotes** — answer parsing no longer breaks when question text contains literal double quotes (e.g. `"Binary file"`, `"All features"`); uses known-question search instead of fragile regex
- **AskUserQuestion comma-in-label** — option labels containing commas (e.g. "Yes, as experimental") now match correctly instead of appearing as custom free-text answers; uses greedy label matching instead of comma-splitting

### Changed
- **Rate limit refresh** — cache TTL reduced from 5 minutes to 1 minute for more responsive dashboard updates during active sessions

---

## [0.3.9] - 2026-06-28

### Added
- **Export options modal** — shown before HTML and Markdown exports with persistent toggles for including summary dashboard and system events panel
- **Markdown export: summary section** — hero stats, token usage table, tool usage table, session details, session IDs, and parse warnings
- **Markdown export: system events section** — hooks (event type, duration, command, exit code, stdout), available skills, task reminders
- **Markdown export: rich tool rendering** — Write (syntax-highlighted), Bash (command fence), Read (file path + line range), AskUserQuestion (question/answer callout), Agent/Task (nested sub-agent turns), ToolSearch (matched tool list)
- **Markdown export: enriched results** — Bash stderr/exitCode from enrichedResult, AskUserQuestion parsed answers, ToolSearch matches
- **Markdown export: frontmatter** — cost_usd, duration_ms, all token counts (input/output/cache-read/cache-write/total/context-window/peak), compaction_count
- **Markdown export: turn indicators** — API error and max-tokens warnings on turn headings
- **Markdown export: compaction preTokens** — pre-compaction context size now included

### Fixed
- **Markdown export tool/result ordering** — tool calls now render paired with their results instead of all calls grouped before all results

### Changed
- Export commands now show options modal before exporting (replaces direct export)
- HTML export conditionally strips summary and system events panels from DOM snapshot based on modal toggles

---

## [0.3.8] - 2026-06-25

### Fixed
- **Text block padding** — added right padding so copy icon doesn't obscure content

---

## [0.3.7] - 2026-06-14

### Changed
- Update tsconfig for TypeScript 5.9+ compatibility
- Upgrade esbuild to fix CVEs

---

## [0.3.6] - 2026-06-13

### Fixed
- **Cost calculation** — per-model pricing with updated Claude 4 family rates (Opus, Fable, Sonnet, Haiku); previously applied single model pricing to all tokens, inflating costs ~3x in mixed-model sessions
- **API error display** — assistant turns with API errors (rate limits, overloaded) now shown instead of filtered out
- **Search input** — focus outline clipping and native hover background bleed-through

### Added
- **Thinking copy button** — copy-to-clipboard button on thinking block headers
- **Custom user answers** — AskUserQuestion renderer shows free-text responses that don't match preset options (dashed accent border + pencil icon)

### Changed
- Update dev dependencies to fix vulnerabilities

---

## [0.3.5] - 2026-05-31

### Added
- **CONTRIBUTING guide** — contributor documentation

### Changed
- **README** — security notices section addressing community scanner warnings

---

## [0.3.4] - 2026-05-12

### Fixed
- **Additional Obsidian community review compliance** — `window.requestAnimationFrame` (7 locations), `window.setTimeout`/`clearTimeout`, `nodeName === 'LINK'` check, removed 25 `!important` CSS declarations via selector specificity, removed duplicate padding property

---

## [0.3.3] - 2026-05-12

### Fixed
- **Obsidian community plugin review compliance**
  - Bump `minAppVersion` to 1.7.2 (required for `revealLeaf`, `createFolder`, `getAllFolders`, `AbstractInputSuggest`, `showAtPosition`)
  - Replace `document` with `activeDocument` for popout window compatibility (14 locations)
  - Replace `setTimeout`/`clearTimeout` with `window.setTimeout`/`clearTimeout` (6 locations)
  - Replace `requestAnimationFrame` with `window.requestAnimationFrame` (7 locations)
  - Replace `builtin-modules` package with Node's built-in `module.builtinModules`
  - Replace `instanceof HTMLLinkElement` with `nodeName === 'LINK'` check
  - Add type guard for `HookSuccessEvent` filter narrowing (fixes unsafe `any` warnings)
  - Use `el.createDiv()` instead of `el.createEl('div')` in folder suggest
  - Remove all 25 `!important` CSS declarations by increasing selector specificity
  - Remove duplicate `padding` property in search clear button styles
- **Rate limit cards** — missing label text now displayed (was defined but unused)

### Added
- **GitHub Actions release workflow** — artifact attestations for `main.js` and `styles.css` on tag push
- **README callout** — explains system identity access (`HOME`, `os.homedir()`) for locating Claude files

### Changed
- `release.mjs` now delegates release creation to GitHub Actions (local script only bumps, builds, tags, and pushes)

---

## [0.3.2] - 2026-04-19

### Fixed
- **Rate limits** - return null on error instead of stale cached data
- **Timeline thinking blocks** - preserve thinking block state across UI refreshes

## [0.3.1] - 2026-04-18

### Fixed
- **Search** - Refresh session from live view before in-session search

## [0.3.0] - 2026-04-18

### Added
- **Compaction tracking** — stats now include compaction event count and peak context window size
- **mjs/cjs syntax highlighting** — JavaScript module extensions recognized in code blocks

### Fixed
- **Search highlight precision** — clicking search results now highlights the exact match text within INPUT blocks (Bash, Edit, Write, generic), not just scrolling to the turn
- **Edit/Write search noise** — filtered out "The file has been updated successfully" boilerplate from search index (these messages aren't rendered)
- **Closed session detection** — search panel detects when tracked session is closed and clears stale state
- **Search keyboard navigation** — options menu positioning fixed, proper focus management
- **Search view styles** — consistent styling across light/dark themes

### Changed
- **Turn-based in-session search** — refactored to use precise content-block coordinates with `data-content-block-idx` stamps for DOM highlighting
- Rate limit cache TTL reduced to 1 minute (was 5 minutes) to reduce 429 errors

---

## [0.2.15]

### Added
- `context_tokens` field in distill frontmatter (context window size from session stats)
- `title` field in distill frontmatter (custom session name from `/rename` command)
- Logger-based debugging for rate limits module

### Fixed
- Duration calculation now uses active time instead of wall-clock time — resumed sessions no longer show inflated durations (e.g., 17,000+ minutes for sessions spanning multiple days)
- Tab title updates correctly when session is renamed during live watch
- Line number indentation preserved when stripping from Read tool output
- System-reminder tags stripped from Read tool results
- Expand/collapse all now includes text blocks
- Relative time formatting no longer shows "3h 60m"
- Distill merge serialization preserves field ordering for new fields

### Changed
- Updated `/distill` skill template with new frontmatter fields
- Updated GOTCHAS.md with frontmatter serialization touchpoints
- Added warning about Claude Code's 30-day session cleanup to docs

---

## [0.2.14] - 2026-04-12

### Fixed
- Obsidian reviewbot scan issues
- Rate limit TTL changed from 5 mins to 1 min
- All AUDIT-2026-04-12 priority items addressed

### Changed
- README.md refactored
- Distill SKILL.md optimized

---

## [0.2.13] - 2026-04-12

### Added
- Session distillation to structured notes with YAML frontmatter (Layer 0, zero LLM cost)
- Clipboard merge workflow for combining `/distill` LLM output with exact session stats
- Obsidian Bases dashboard templates (Session Dashboard, Cost Tracker, Recent Sessions, Error Patterns)
- System events panel showing hooks, skills, and task reminders
- Inline hook indicators on tool calls (zap icon for PreToolUse, shield icon for PermissionRequest)
- Custom session title support from `/rename` command
- Public API for inter-plugin communication (`getActiveSession`, `parseSessionFile`, `onSessionParsed`, `getSessionIndex`)
- Expand/collapse all blocks commands
- Search panel refresh button

### Changed
- Updated documentation (ARCHITECTURE.md, GOTCHAS.md, ROADMAP.md, CLAUDE.md, README.md)

---

## [0.2.12] - 2026-04-10

### Added
- ToolSearch tool renderer with `tool_reference` block parsing
- AskUserQuestion tool renderer with Q&A display
- Show more/less toggles working in HTML exports

### Fixed
- Sub-agent session resolution from separate JSONL files (`subagents/agent-<id>.jsonl`)

---

## [0.2.11] - 2026-04-08

### Fixed
- ANSI escape codes using `String.fromCharCode(0x1b)` instead of literal `\x1b` (community plugin scan compliance)

---

## [0.2.10] - 2026-04-07

### Fixed
- Resolved all Obsidian community plugin scan lint violations

---

## [0.2.9] - 2026-04-06

### Fixed
- Minor manifest updates

---

## [0.2.8] - 2026-04-05

### Fixed
- Manifest description update

---

## [0.2.7] - 2026-04-04

### Fixed
- ESLint configuration cleanup

---

## [0.2.6] - 2026-04-03

### Added
- BM25 relevance-ranked search
- Per-session pin state for summary dashboard
- Expand-to-highlight in search navigation

### Fixed
- Search accuracy and navigation reliability
- Interactive element accessibility (makeClickable)
- HTML export CSS snippet theme overrides

---

## [0.2.5] - 2026-04-01

### Added
- Rate limit utilization display in summary hero cards (beta, opt-in)
- Reset time display below rate limit progress bars

### Fixed
- Pinned hero scrollbar behavior
- Progress tooltip clipping
- Export markdown title handling

### Removed
- Hook icons feature (dead JSONL format from older Claude Code versions)

---

## [0.2.0] - 2026-03-15

### Added
- Initial public release
- Session timeline view with turn rendering
- Tool-specific renderers (Bash, Edit, Write, Read)
- Summary dashboard with hero cards and charts
- Live watch with UI state preservation
- Cross-session and in-session search
- HTML and Markdown export
- Deep linking via protocol handler

---

[0.3.17]: https://github.com/gapmiss/claude-sessions/compare/0.3.16...0.3.17
[0.3.16]: https://github.com/gapmiss/claude-sessions/compare/0.3.15...0.3.16
[0.3.15]: https://github.com/gapmiss/claude-sessions/compare/0.3.14...0.3.15
[0.3.14]: https://github.com/gapmiss/claude-sessions/compare/0.3.13...0.3.14
[0.3.13]: https://github.com/gapmiss/claude-sessions/compare/0.3.12...0.3.13
[0.3.12]: https://github.com/gapmiss/claude-sessions/compare/0.3.11...0.3.12
[0.3.11]: https://github.com/gapmiss/claude-sessions/compare/0.3.10...0.3.11
[0.3.10]: https://github.com/gapmiss/claude-sessions/compare/0.3.9...0.3.10
[0.3.9]: https://github.com/gapmiss/claude-sessions/compare/0.3.8...0.3.9
[0.3.8]: https://github.com/gapmiss/claude-sessions/compare/0.3.7...0.3.8
[0.3.7]: https://github.com/gapmiss/claude-sessions/compare/0.3.6...0.3.7
[0.3.6]: https://github.com/gapmiss/claude-sessions/compare/0.3.5...0.3.6
[0.3.5]: https://github.com/gapmiss/claude-sessions/compare/0.3.4...0.3.5
[0.3.4]: https://github.com/gapmiss/claude-sessions/compare/0.3.3...0.3.4
[0.3.3]: https://github.com/gapmiss/claude-sessions/compare/0.3.2...0.3.3
[0.3.2]: https://github.com/gapmiss/claude-sessions/compare/0.3.1...0.3.2
[0.3.1]: https://github.com/gapmiss/claude-sessions/compare/0.3.0...0.3.1
[0.3.0]: https://github.com/gapmiss/claude-sessions/compare/0.2.15...0.3.0
[0.2.15]: https://github.com/gapmiss/claude-sessions/compare/0.2.14...0.2.15
[0.2.14]: https://github.com/gapmiss/claude-sessions/compare/0.2.13...0.2.14
[0.2.13]: https://github.com/gapmiss/claude-sessions/compare/0.2.12...0.2.13
[0.2.12]: https://github.com/gapmiss/claude-sessions/compare/0.2.11...0.2.12
[0.2.11]: https://github.com/gapmiss/claude-sessions/compare/0.2.10...0.2.11
[0.2.10]: https://github.com/gapmiss/claude-sessions/compare/0.2.9...0.2.10
[0.2.9]: https://github.com/gapmiss/claude-sessions/compare/0.2.8...0.2.9
[0.2.8]: https://github.com/gapmiss/claude-sessions/compare/0.2.7...0.2.8
[0.2.7]: https://github.com/gapmiss/claude-sessions/compare/0.2.6...0.2.7
[0.2.6]: https://github.com/gapmiss/claude-sessions/compare/0.2.5...0.2.6
[0.2.5]: https://github.com/gapmiss/claude-sessions/compare/0.2.0...0.2.5
[0.2.0]: https://github.com/gapmiss/claude-sessions/releases/tag/0.2.0
