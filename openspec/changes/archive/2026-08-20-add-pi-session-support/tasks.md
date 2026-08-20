## 1. Format plumbing

- [x] 1.1 Widen `SessionFormat` in `src/types.ts` to `'claude' | 'pi'` and fix the resulting
  type errors (the format badge and entry construction already carry the value through).
- [x] 1.2 Add pi's protocol strings to `src/constants.ts`: record types (`session`, `message`,
  `thinking_level_change`, `model_change`), message roles (`user`, `assistant`, `toolResult`,
  `bashExecution`), and content block types (`text`, `thinking`, `toolCall`). No magic strings
  outside this file.
- [x] 1.3 Introduce the per-format record-shape prober described in design.md decision 2: each
  format supplies cheap substring/regex matchers for "is a conversation record", "carries the
  session id" and "is a user prompt". Keep it in one registry so a third format has somewhere
  to go.

## 2. pi parser

- [x] 2.1 Create `src/parsers/pi-parser.ts` with `PiParser extends BaseParser`, `format = 'pi'`,
  and `canParse()` matching on record shape only — a `type: "session"` record, or a
  `type: "message"` whose nested `message.role` is a known pi role. Never on filename or path.
- [x] 2.2 Build `SessionMetadata` from the `session` record: `id`, `cwd`, `version`, `timestamp`
  as start time. Derive the project name from `cwd`. Leave `branch` undefined — pi records none.
- [x] 2.3 Map `user` and `assistant` messages to turns, converting `text` blocks to text content
  and `thinking` blocks to thinking content. Follow the existing rule that consecutive assistant
  records merge into one turn.
- [x] 2.4 Map `toolCall` blocks to tool-use content, carrying `name`, `arguments` and `id`.
- [x] 2.5 Attach `toolResult` messages to the tool call they belong to via `toolCallId`, and mark
  results whose `isError` is set as failed.
- [x] 2.6 Map `bashExecution` messages to a command block carrying `command`, `output` and
  `exitCode`; note that its `content` is null and the payload sits on the message itself.
- [x] 2.7 Represent `thinking_level_change` and `model_change` as system events, or skip them —
  whichever the existing system-events panel supports without new event types.
- [x] 2.8 Handle unknown record and content block types the way the Claude parser does: count and
  log a warning, never blank a turn or abort the parse.
- [x] 2.9 Register `PiParser` in `src/parsers/detect.ts`.

## 3. Discovery

- [x] 3.1 Make `hasContent` in `src/utils/streaming-reader.ts` use the prober from 1.3 instead of
  testing for a top-level `"type":"user"`/`"type":"assistant"`. This is the blocker that hides
  every pi session; verify a pi transcript is no longer judged empty.
- [x] 3.2 Resolve the session id per format — pi names it `id` on the `session` record, not
  `sessionId` — so a pi entry reports its real id rather than falling back to the filename.
- [x] 3.3 Extend last-prompt-time extraction to pi's nested user role, so the existing
  order-by-last-prompt behaviour works across formats. Keep the head-only check and the regex;
  do not introduce a full parse.
- [x] 3.4 Add `~/.pi/agent/sessions` to the default `sessionDirs`. Confirm a missing directory is
  still skipped silently.
- [x] 3.5 Bump `INDEX_VERSION` in `src/utils/session-index.ts` and record the reason in the
  comment alongside the existing entries.
- [x] 3.6 Confirm the project name for a pi session comes out clean via the existing
  `cwd`-based derivation, with no change needed to the scanner.

## 4. Cost and statistics

- [x] 4.1 Give the stats layer a recorded-cost path distinct from the computed one, so a format
  that reports its own cost is not run through `MODEL_PRICING`.
- [x] 4.2 Map pi's `usage` fields (`input`, `output`, `cacheRead`, `cacheWrite`, `reasoning`,
  `totalTokens`) onto the existing token counters, and read `usage.cost.total` as the recorded
  cost.
- [x] 4.3 Omit the cost figure when a session has usage but neither a recorded cost nor a price
  entry for its model, rather than showing zero.
- [x] 4.4 Check no summary presents a cross-format cost total as though one method produced it.

## 5. Rebrand and deep links

- [x] 5.1 Update `name` and `description` in `manifest.json` to the neutral identity. Confirm the
  proposed "Agent Sessions" / `agent-sessions` naming before applying it.
- [x] 5.2 Register the neutral protocol handler in `src/main.ts` **in addition to** the existing
  `claude-sessions` handler, both delegating to the same resolution path.
- [x] 5.3 Reword user-facing copy that claims a single agent: view titles, settings labels,
  notices, command names.
- [x] 5.4 Guard task: confirm the plugin `id` in `manifest.json` and the `claude-sessions-*` CSS
  prefix are unchanged, and that `app.plugins.plugins['claude-sessions']` still resolves
  (design.md decision 4).

## 6. Tests

- [x] 6.1 Add pi fixtures to `tests/fixtures.ts` mirroring the real record shapes: session
  record, user/assistant messages, text/thinking/toolCall blocks, toolResult (ok and error),
  bashExecution.
- [x] 6.2 Unit-test `PiParser.parse()`: metadata extraction, turn construction, thinking blocks,
  tool call arguments, tool result attachment by `toolCallId`, error results, command blocks.
- [x] 6.3 Unit-test detection: a pi transcript resolves to `PiParser`, a Claude transcript still
  resolves to `ClaudeParser`, and an unrecognised file resolves to null.
- [x] 6.4 Unit-test the prober: a pi transcript reports content, a Claude transcript reports
  content, a metadata-only transcript reports none.
- [x] 6.5 Unit-test cost: pi's recorded cost is used verbatim, `MODEL_PRICING` is not applied to
  a pi session, and cost is omitted when neither source applies.
- [x] 6.6 Unit-test unknown pi record and block types: warning recorded, turns intact.
- [x] 6.7 Regression-test that Claude parsing, stats and cost are byte-identical to before.
- [x] 6.8 `npm test`, `npx eslint .` and `npx tsc -noEmit -skipLibCheck` all clean.

## 7. Verification against real data

- [x] 7.1 Run the parser over all 13 local pi transcripts and confirm none throw, none produce
  zero turns, and warning counts are explainable.
- [x] 7.2 In Obsidian: pi sessions appear in the browser alongside Claude sessions, each with the
  correct format badge and project name.
- [x] 7.3 Open a pi session and check rendering: thinking blocks, tool calls with arguments, tool
  results attached to their calls, error results, a shell execution.
- [x] 7.4 Confirm ordering interleaves pi and Claude sessions in true last-prompt order.
- [x] 7.5 Confirm the summary panel shows pi's own cost and sane token counts.
- [x] 7.6 Export a pi session to HTML and to Markdown; confirm both produce usable output.
- [x] 7.7 Activate a link under both protocol schemes and confirm both open the same session,
  including one link saved before the rebrand.
- [x] 7.8 Temporarily move `~/.pi` aside and confirm the browser still opens cleanly with no
  error, to represent a reader who does not use pi.

## 8. Documentation

- [x] 8.1 Add pi to `COMPATIBILITY.md`: its record types, the observed `session.version` (3), and
  the pi CLI version tested against.
- [x] 8.2 Add `GOTCHAS.md` entries: content detection must never hard-code one format's record
  shape (this is what hid pi sessions), and the two-tier prober rule — correctness-critical
  checks read a parsed record, only the whole-file sweep may use a 200-character head, because
  Claude writes its top-level `type` a median 1146 characters into the line.
- [x] 8.3 Update `README.md`, `CLAUDE.md` and `ARCHITECTURE.md` for the second format and the
  rebranded identity, including that both protocol schemes are supported and why the plugin id
  and CSS prefix did not move.
- [x] 8.4 Add a `CHANGELOG.md` entry under Unreleased, marking the rebrand as breaking and
  stating explicitly that existing deep links keep working.
