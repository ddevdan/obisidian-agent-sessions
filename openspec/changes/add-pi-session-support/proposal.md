## Why

The viewer reads exactly one transcript format. The parser layer was built for more than
one — `SessionFormat` is a union type, `detect.ts` is a registry array, and `BaseParser`
asks for only three members — but nothing has ever exercised that seam.

pi is a second agent CLI already in use on this machine, storing transcripts as JSONL under
`~/.pi/agent/sessions/<mangled-cwd>/<timestamp>_<uuid>.jsonl` — the same layout shape the
existing scanner already walks. Its format is smaller than Claude Code's (four record types
observed at planning time; pi in fact declares ten — see design.md and COMPATIBILITY.md)
and maps almost one-to-one onto the viewer's `Session`/`Turn`/`ContentBlock` model.

The blockers are not in parsing. They are in discovery: the metadata scan decides a session
is empty unless it sees a top-level `"type":"user"` or `"type":"assistant"` record, and pi
nests the role one level down inside `type: "message"`. So pi sessions are silently filtered
out before any parser is consulted.

## What Changes

- A pi parser maps pi transcripts onto the existing session model: `text`, `thinking` and
  `toolCall` content blocks, `toolResult` and `bashExecution` message roles, and the
  `session` record's `cwd`/`version`/`id`.
- The quick-metadata scan becomes format-aware, so a pi session is recognised as having
  content, reports its session id, and yields a last-prompt time for the existing ordering.
- `~/.pi/agent/sessions` joins the default session directories. The scanner already tolerates
  a missing directory, so users without pi see no change.
- pi sessions report the cost pi itself recorded. `MODEL_PRICING` is Anthropic-keyed and pi
  runs other providers (the sampled session is `gpt-5.6-sol` via `openai-codex`), so applying
  it would produce confidently wrong figures.
- **BREAKING** The plugin is rebranded away from a Claude-only identity: display name,
  description, user-facing copy and documentation stop claiming a single agent, and a
  provider-neutral protocol handler is registered.
- The existing `obsidian://claude-sessions` handler is **retained** alongside the new one, so
  every deep link already saved in a distilled note, an exported file, or an external script
  keeps working. Nothing that resolves today stops resolving.

Two identifiers are deliberately **not** renamed, because both are contracts rather than
copy — see design.md for the reasoning:

- the plugin id in `manifest.json` (renaming it orphans user settings and breaks the
  documented `app.plugins.plugins['claude-sessions']` API surface)
- the `claude-sessions-*` CSS class prefix (496 occurrences, and `THEMING.md` publishes it as
  the theming surface users write snippets against)

## Capabilities

### New Capabilities
- `session-viewer/session-formats`: which transcript formats the viewer recognises, how each
  is discovered on disk, and how a format's records map onto turns, content blocks, token
  usage and cost.
- `session-viewer/deep-links`: the protocol handlers the plugin answers to, and the guarantee
  that links minted under the old scheme continue to resolve.

### Modified Capabilities
<!-- None. `session-viewer/text-selection` is the only existing spec and this change does not
     alter any of its requirements — selection behaviour is format-independent. -->

Out of scope, by decision: restyling the timeline to resemble pi's HTML export. That is a
theme-level concern — the plugin already publishes 45 `--cs-*` variables and a `THEMING.md`
contract for it — and it styles the view rather than the format, so it applies to Claude and
pi sessions alike. It will be proposed as its own change so this one stays reviewable and
independently revertible.

## Impact

- `src/parsers/pi-parser.ts` (new), `src/parsers/detect.ts` (register), `src/types.ts`
  (`SessionFormat` union), `src/constants.ts` (pi record/role/block strings).
- `src/utils/streaming-reader.ts` — format-aware `hasContent`, session id and last-prompt time.
- `src/utils/session-index.ts` — `INDEX_VERSION` bump; cached entries predate any pi field.
- `src/types.ts` default settings — `sessionDirs` gains `~/.pi/agent/sessions`.
- `src/main.ts` — second protocol handler, legacy handler retained.
- `manifest.json`, `README.md`, `CLAUDE.md`, `COMPATIBILITY.md`, `ARCHITECTURE.md` — identity
  and format documentation.
- Cost/stats: pi's own `usage.cost` is read rather than computed. Claude sessions are
  untouched.
- No change to the exporters' output structure, the distill pipeline, or selection behaviour.
- Test corpus available on this machine: 13 pi sessions across 2 projects.
