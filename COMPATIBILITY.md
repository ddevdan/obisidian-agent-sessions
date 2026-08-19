# Claude Code Compatibility

This document tracks which Claude Code versions introduced JSONL format changes that affect this plugin.

**Current Claude Code version being tested against: 2.1.214**

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
