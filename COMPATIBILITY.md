# Agent Transcript Compatibility

This document tracks the transcript formats this plugin reads, and which agent versions
introduced changes that affect it. Claude Code is covered first, pi below it.

**Current Claude Code version being tested against: 2.1.214**
**Current pi version being tested against: 0.84.2** (`@earendil-works/pi-coding-agent`)

---

## JSONL Format Evolution

| Feature | CC Version | Plugin Version | Status | Notes |
|---------|------------|----------------|--------|-------|
| Basic JSONL format | 1.0+ | 0.2.0+ | Stable | Core record types: user, assistant, progress |
| Token usage in message | ~2.0+ | 0.2.0+ | Stable | `message.usage` with input/output/cache tokens |
| Encrypted thinking | 2.1.79+ | 0.2.0+ | Stable | `thinking` field empty, content in `signature` |
| Separate subagent JSONL | ~2.1.85? | 0.2.11+ | Stable | `subagents/agent-<id>.jsonl` files alongside `.meta.json` |
| `tool_reference` blocks | ~2.1.88? | 0.2.12+ | Stable | ToolSearch results use this instead of text blocks |
| System events (`stop_hook_summary`) | ~2.1.90? | 0.2.13+ | New | Hook events with `hookInfos[]` array |
| System events (`skill_listing`) | ~2.1.90? | 0.2.13+ | New | Available skills in `system` records |
| System events (`task_reminder`) | ~2.1.90? | 0.2.13+ | New | Task tool reminders |
| Custom titles (`/rename`) | ~2.1.90? | 0.2.13+ | Unobserved | `<custom-title>` XML in user records. Zero occurrences across a 361-session corpus spanning 2.1.215–2.1.235 — support retained for older sessions, but `ai-title` is what current versions emit. Wins over `ai-title` when present |
| `PermissionRequest` hook event | 2.1.92+ | 0.2.13+ | New | Tool-level permission request indicators |
| `pr-link` records | ~2.1.50? | 0.3.16+ | Skipped | PR number/URL/repo metadata, no renderable content |
| `AskUserQuestion` option `preview` | ~2.1.92? | 0.3.16+ | New | Per-option mockup/code sample; rendered as collapsible preformatted block |
| `agent-color` records | ~2.1.119? | 0.3.16+ | Skipped | Sibling of `agent-name`, metadata only |
| `file-history-delta` records | ~2.1.214? | 0.3.16+ | Skipped | Per-file backup pointer, sibling of `file-history-snapshot` |
| `last-prompt` records | ≤2.1.215 | 0.3.16+ | Skipped | `{"type":"last-prompt","lastPrompt":"...","leafUuid":"...","sessionId":"..."}`. Carries **no timestamp**, and `leafUuid` points at any record type (usually `system`, not `user`) — so it cannot supply a cheap recency key. The session list sorts on the last `user` record's timestamp instead, which agrees to a median of 26s and covers 100% of sessions vs 76%. Present on 73% of sessions |
| `ai-title` records | ≤2.1.215 | 0.3.22+ | New | `{"type":"ai-title","aiTitle":"...","sessionId":"..."}` — Claude Code's auto-generated session name, the label its own `/resume` picker shows. Emitted repeatedly as the session evolves, so **keep the last**. Not version-gated: across 2.1.215–2.1.235 the same versions appear both with and without it, so absence means the session never got a title (short sessions), not an older format. Observed on ~50% of sessions |

**Legend:**
- `~` = Approximate version (not confirmed exactly when introduced)
- `?` = Needs verification
- Stable = Confirmed working across multiple versions
- New = Recently implemented, needs broader testing
- Skipped = Metadata-only record, filtered out rather than rendered
- Unobserved = Supported in code, but absent from the current corpus — kept for older sessions

---

## pi Transcript Format

pi stores transcripts as JSONL under `~/.pi/agent/sessions/<mangled-cwd>/<timestamp>_<uuid>.jsonl`
— one directory level, the same layout shape the scanner already walks for Claude Code.

The `session` record carries a `version` field, so the format is explicitly versioned.
**Observed `session.version`: 3.**

pi's `SessionEntry` union declares **ten** record types. Only five have been observed in
real transcripts; the rest are listed so their absence reads as "not seen yet" rather than
"does not exist". Unhandled types are counted and warned about, never dropped silently.

| Record type | Status | Notes |
|-------------|--------|-------|
| `session` | New | One per transcript, first line. Carries `id`, `cwd`, `version`, `timestamp`. The only source of session identity — pi has no `sessionId` field |
| `message` | New | All conversation content. The role is nested at `message.role`, **not** the record's own `type` |
| `session_info` | New | User-set session name, from `--name` or `setSessionName()`. Latest entry wins, and a blank `name` is an explicit **clear** rather than a title — this mirrors pi's own resolution (`name?.trim() \|\| undefined`). Maps to `customTitle`, the same provenance as Claude Code's `/rename` |
| `thinking_level_change` | Skipped | Reasoning-effort change, no renderable content |
| `model_change` | Skipped | Model switch, no renderable content |
| `compaction` | Unobserved | pi **does** have compaction (see its `docs/compaction.md`). Not yet handled, so `compactionCount` and the context-peak stats stay zero for pi |
| `branch_summary` | Unobserved | Summary of a summarised branch |
| `label` | Unobserved | User label attached to an entry |
| `custom` | Unobserved | Extension-authored state entry; does not participate in context |
| `custom_message` | Unobserved | Extension-authored message entry |

| `message.role` | Maps to | Notes |
|----------------|---------|-------|
| `user` | user turn | `content[]` of blocks |
| `assistant` | assistant turn | Consecutive assistant records merge into one turn. Carries `model`, `provider`, `usage`, `stopReason`, `errorMessage` |
| `toolResult` | tool result block | Attached to its call via `toolCallId`; `isError` marks failure |
| `bashExecution` | command block | Payload is on the message itself (`command`, `output`, `exitCode`); `content` is null |

| `content[]` block | Maps to | Notes |
|-------------------|---------|-------|
| `text` | text block | |
| `thinking` | thinking block | Also carries `thinkingSignature` |
| `toolCall` | tool use block | `arguments` becomes the tool input; `id` pairs with `toolCallId` |

### Things to know when working on this

- **The role is nested.** A content check written against Claude's shape — where the role
  *is* the record's `type` — judges every pi transcript empty. That is exactly the bug this
  support had to fix, and it hid all pi sessions rather than failing loudly.
- **pi records its own cost.** Each assistant `usage` carries a `cost` breakdown including
  `cost.total`. Its models are not Anthropic — `gpt-5.6-sol` and `deepseek-v4-pro` observed —
  so the built-in `MODEL_PRICING` table must never be applied to them. It would silently fall
  back to Sonnet rates. `SessionStats.costSource` records which path produced a figure.
- **Every line begins with the record type**, which Claude Code's lines never do. That makes
  the line prefix an exact format discriminator for the cheap discovery sweep.
- **Transcripts are trees.** Every record carries `parentId`. The viewer's model is a linear
  turn list, so records are read in file order and `parentId` is ignored. A rewound-and-branched
  transcript would show every branch in the order written; none has been observed.
- **No git branch.** pi records none, so that field stays empty.
- **A session title only if you set one.** pi has no auto-generated name, so there is no
  `aiTitle` equivalent — an unnamed session falls back to the project name. Set one with
  `pi --name "..."` or `setSessionName()` and it appears as the session's title.

---

## Deprecated/Removed Formats

| Feature | Removed In | Notes |
|---------|------------|-------|
| `hook_progress` in progress records | ~2.1.80? | Replaced by `system` records with `stop_hook_summary` |
| Inline `agent_progress` records | ~2.1.85? | Replaced by separate `subagents/*.jsonl` files |

---

## How to Update This Document

When implementing support for a new JSONL feature:

1. **Check your Claude Code version**
   ```bash
   claude --version
   ```

2. **Add a row to the table above** with:
   - Feature name
   - Your current CC version (use `~` prefix if you're not sure when it was introduced)
   - Plugin version that adds support
   - Status: `New` initially, change to `Stable` after confirmed across versions

3. **Update test fixtures** if applicable — add a comment noting the CC version:
   ```typescript
   /** System event record. CC 2.1.90+ */
   export function systemHookEvent(...) { }
   ```

4. **Test with older sessions** if possible to determine backwards compatibility

---

## Version Detection

The plugin currently does not detect Claude Code version from session files. Session metadata includes:
- `version` field (Claude Code version string, e.g., "2.1.92")

Future enhancement: Use this to conditionally enable/disable features or show compatibility warnings.

---

## Reporting Format Changes

If you encounter a JSONL format that the plugin doesn't handle:

1. Note your Claude Code version (`claude --version`)
2. Check the console for "Unknown record type" or "Unknown block type" warnings
3. Open an issue with:
   - CC version
   - Sample JSONL record (redact sensitive content)
   - Expected behavior

The parser logs unknown types with counts to help detect format changes early.
