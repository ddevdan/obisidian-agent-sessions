## Context

See `proposal.md` — Why.

State that shapes the approach, established by reading the code and pi's own transcripts:

- The parser layer already has the right seam and has simply never been exercised.
  `SessionFormat` is a one-member union, `detect.ts` is an array of parser instances tried in
  order, and `BaseParser` demands only `format`, `canParse(firstLines)` and `parse(content,
  filePath)`. Adding a format is a new class plus one registry entry.
- pi's format is smaller than Claude Code's. Four record types: `session` (`cwd`, `id`,
  `version`, `timestamp`), `message` (`id`, `parentId`, `timestamp`, nested `message`),
  `thinking_level_change`, `model_change`. Nested message roles are `user`, `assistant`,
  `toolResult` and `bashExecution`; content block types are `text`, `thinking` and `toolCall`.
- **The blocker is discovery, not parsing.** `extractQuickMetadataAsync` sets `hasContent` only
  for a top-level `"type":"user"` or `"type":"assistant"`, and pi nests the role inside
  `type: "message"`. Every pi session is therefore judged empty and dropped before
  `detectParser()` is ever called. The same shape assumption breaks `lastPromptTime` (added by
  the session-ordering change) and the session id, which pi calls `id` rather than `sessionId`.
- One thing already works untouched: pi's `session` record carries a top-level `cwd` on line 1,
  and the scan picks up `cwd` from any record in the first 100 lines, so `projectFromCwd()`
  yields a clean project name with no change.
- pi's layout is `~/.pi/agent/sessions/<mangled-cwd>/<timestamp>_<uuid>.jsonl` — one directory
  level, which is exactly the shape `scanSessionDirs` already walks.
- pi records its own cost per assistant message (`usage.cost.total`, plus a per-category
  breakdown). Its models are not necessarily Anthropic; the sampled session ran `gpt-5.6-sol`
  via `openai-codex`. `MODEL_PRICING` is keyed by Anthropic model family.
- The `claude-sessions` string appears ~1187 times: 496 in `styles.css` as the CSS class
  prefix, 619 in `src/`, 72 in docs, plus the plugin id, the protocol handler, and the
  documented `app.plugins.plugins['claude-sessions']` API entry point.

## Goals / Non-Goals

**Goals:**

- Adding a third format later should touch the format registry and nothing else. This change
  is the one that has to build that path, since it is the first to walk it.
- No behavioural change to Claude sessions — parsing, stats, cost, ordering or rendering.
- No deep link that resolves today stops resolving.

**Non-Goals:**

- Reproducing pi's export appearance. Deferred to its own change (see proposal).
- A general provider-pricing engine. Cost is read, not computed, for formats that record it.
- Preserving pi's conversation *tree*. The viewer's model is a linear turn list.
- Renaming the CSS class prefix or the plugin id (see Decision 4).
- Sub-agent resolution for pi — its transcripts show no sub-agent concept.

## Decisions

### 1. A pi parser registered in the existing detection array

Implement `PiParser extends BaseParser` with `format = 'pi'`, and add it to the `parsers` array
in `detect.ts`. `canParse()` matches on record shape — a `type: "session"` record, or a
`type: "message"` record whose nested `message.role` is one of pi's roles — never on filename
or directory.

Content-based detection is already the contract the spec states, and it is what lets a pi
transcript open from an arbitrary location.

Alternative considered: branch inside `ClaudeParser`. Rejected — it would put two unrelated
record vocabularies in one 1000-line class and give the next format nowhere to go.

### 2. Format-aware quick metadata via a per-format prober

The metadata scan needs three things it currently derives from Claude-shaped records:
`hasContent`, the session id, and the last-prompt time. Rather than accreting `if pi` branches
in the line loop, introduce a small per-format prober — a record-shape matcher each format
supplies — and let the scan consult the registry.

Rationale: this is the file where the bug lives, and the reason it existed is that one format's
record shape was hard-coded as the definition of "has content". Fixing it with another
hard-coded shape reproduces the defect for format three.

Constraint carried over from the ordering change: the scan must stay cheap. It runs over every
transcript on every browser open, deliberately avoiding `JSON.parse` on multi-KB lines.

**Revised during implementation.** The first attempt made every prober substring-level over a
200-character head, which measurement showed cannot work: Claude Code writes its top-level
`type` *after* a long preamble (`parentUuid`, `cwd`, `sessionId`, `version`, `gitBranch`) at a
median offset of 1146 characters and up to 48KB in, so 62% of its conversation records carry no
`type` inside any sensible head budget. A head-only content check produced 29,768 false
negatives on the real corpus. Separately, the literal `"type":"message"` appears in the head of
7,180 Claude assistant records, so it is not a usable pi signal on its own.

Probers are therefore two-tiered:

- **Record tier** — `isConversationRecord()` and `sessionIdFrom()` take a parsed record. They
  run inside the loop that *already* parses a transcript's opening lines for metadata, so they
  add no parsing cost, and correctness here is non-negotiable: a false negative hides a session.
- **Line tier** — `isUserPromptLine()` takes a 200-character head, for the whole-file sweep that
  dates a session by its last prompt. No parse is available there. A miss degrades to the file
  mtime, so approximation is acceptable. pi's line test anchors on the line *prefix*
  (`{"type":"message"`), which is exact: pi writes the record type first on every line and Claude
  never does.

Verified against both corpora: 76,638 Claude records and 944 pi records, zero false positives,
zero false negatives, 74,481 session ids matched, and neither format's probes firing on the
other's records.

Alternative considered: parse every transcript properly during discovery and delete the quick
scan. Rejected — it would replace a cheap scan with a full parse of every session on disk.

### 3. Cost is read when the transcript records it, computed only when it does not

Give the stats layer two paths: a recorded cost, taken verbatim from the transcript, and the
existing computed cost from `MODEL_PRICING`. pi takes the first; Claude keeps the second,
unchanged. When neither applies — usage present, no recorded cost, no price entry for the
model — the summary omits cost rather than printing a zero or an Anthropic-rate guess.

Rationale: pi already knows what it was billed, across providers this project has no price
table for. Reading that number is both cheaper and more accurate than modelling it. The
spec states this as a requirement because showing a wrong cost is worse than showing none.

Alternative considered: extend `MODEL_PRICING` per provider. Rejected — more work, needs
maintenance as third-party prices move, and would drift from what pi actually recorded.

### 4. Rebrand the identity, keep the two identifiers that are contracts

Rebranded: display name and description in `manifest.json`, user-facing copy, view titles,
`README.md` and the other docs, plus a new provider-neutral protocol handler.

Deliberately unchanged, despite the request being a full rebrand:

- **The plugin id.** Obsidian keys installed plugins, their data directory and
  `app.plugins.plugins[...]` by id. Changing it makes Obsidian treat this as a different
  plugin: the reader's settings at `.obsidian/plugins/claude-sessions/data.json` are orphaned,
  pinned sessions and configured directories are lost, and every documented consumer of the
  public API breaks. `CLAUDE.md` states the API is a stable surface where removals are
  breaking.
- **The `claude-sessions-*` CSS prefix.** `THEMING.md` publishes it as the surface readers
  write snippets against, and `examples/` ships a theme built on it. Renaming 496 selectors
  would silently break every user theme for no visible gain.

Both are invisible to a reader in normal use; the name, the view titles and the docs are what
actually read as "Claude-only". If the id must change later it should be its own change, with a
data-migration step, not a side effect of adding a format.

**Proposed neutral name: "Agent Sessions", with protocol scheme `agent-sessions`.** This is the
one purely cosmetic choice in the change and is worth a glance before implementation; it
affects strings, not structure or task breakdown.

### 5. Register the new handler alongside the old one, permanently

`registerObsidianProtocolHandler` is called twice, with the new scheme and the existing
`claude-sessions`, both delegating to the same resolution path.

The legacy scheme is retained without a removal date. The plugin mints these links into
distilled notes and exported artifacts it does not own and cannot rewrite, and external
scripts use them too. There is no mechanism by which a deprecation could reach those links, so
"deprecate and remove" would just mean breaking them later instead of now.

### 6. Linearise pi's tree by file order

Every pi record carries `parentId`, making the transcript a tree; the viewer's model is a flat
turn list. Read records in file order and ignore `parentId`, which is what the Claude parser
effectively does.

Accepted limitation: if pi supports rewinding a conversation and writing a divergent branch to
the same file, a linear read shows all branches in the order written rather than only the
active one. Nothing in the 13 available transcripts exhibits this. Recorded as a risk rather
than solved speculatively — solving it needs a real example to test against.

### 7. Bump the session index version

`INDEX_VERSION` must rise: cached entries were written before any pi-aware field existed, and
entries are reused whenever the version matches and the mtime is unchanged.

## Risks / Trade-offs

- **A pi transcript shape not present in the 13 local sessions** — 421 tool results and one
  shell execution is thin coverage for `bashExecution`, and no images appear at all → parse
  defensively, treat unknown record and block types as skippable with a logged warning (the
  pattern the Claude parser already uses), and never let one unknown record blank a turn.
- **Rebrand is judged incomplete** because the id and CSS prefix survive → stated plainly in
  the proposal and above, so it is a visible decision rather than an omission. Reversible as
  its own change if the reader wants the id moved, with migration.
- **The quick-metadata prober slows the browser** → probers stay substring-level over a
  200-character head; the ordering change's approach is the benchmark to match.
- **Cost figures become inconsistent in aggregate** if a summary ever sums a recorded pi cost
  with a computed Claude cost → keep the two paths visible per session rather than presenting a
  cross-format total as if one method produced it.
- **pi changes its format** — its `session` record already carries `version: 3`, so it is
  versioned and moving → record the observed version in `COMPATIBILITY.md` alongside the Claude
  Code table, and log unknown record types rather than failing.
- **A divergent-branch pi transcript renders confusingly** (Decision 6) → accepted; needs a
  real example before designing for it.

## Migration Plan

No data migration. The plugin id is unchanged, so settings, the session index and pinned
sessions carry over untouched; the index re-reads once because its version rises, which is the
existing mechanism.

Deep links need no migration by construction — the old scheme keeps working (Decision 5). The
standalone opener script outside this repo, which uses the old scheme, therefore keeps working
unmodified.

Rollback is reverting the commit. The only persisted side effect is the rebuilt session index,
which any version rebuilds on demand.

## Open Questions

None that can be deferred without changing the specs or the task breakdown. The neutral name
and scheme in Decision 4 are cosmetic and stated there as a proposal to confirm.
