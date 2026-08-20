## Purpose

Defines which agent transcript formats the viewer can read, how sessions in each format are
found on disk, and how a format's records are presented as turns, content blocks, token usage
and cost — so that adding an agent does not change how any existing session behaves.

## ADDED Requirements

### Requirement: More than one transcript format is supported

The viewer SHALL read transcripts from more than one agent. Support for an additional format
SHALL NOT alter the parsing, presentation, statistics or ordering of sessions in a format that
was already supported.

#### Scenario: Both formats appear in one list

- **WHEN** the reader opens the session browser with both Claude Code and pi transcripts present
- **THEN** sessions of both formats are listed together
- **AND** each entry shows which format it came from

#### Scenario: Existing format is unaffected

- **WHEN** a Claude Code session is opened after pi support is added
- **THEN** its turns, tool rendering, statistics, cost and ordering are unchanged

### Requirement: Format is determined by content

The viewer SHALL determine a transcript's format by inspecting the transcript's own records,
not by its file name, file extension, or the directory it was found in.

#### Scenario: A pi transcript outside its default location

- **WHEN** a pi transcript is found in a directory the reader added manually
- **THEN** it is recognised as a pi session and opens normally

#### Scenario: An unrecognised transcript

- **WHEN** the reader opens a file whose records match no supported format
- **THEN** the viewer reports that the format could not be detected
- **AND** no partially-parsed session is shown

### Requirement: A session with conversation content is always listed

A transcript containing at least one user or assistant exchange SHALL be treated as having
content and listed, whatever format it is in. A transcript with no exchange SHALL continue to
be omitted as empty.

This is stated explicitly because content detection previously depended on a record shape that
only one format uses, which silently excluded every session in any other format.

#### Scenario: pi session with exchanges is listed

- **WHEN** a pi transcript containing user and assistant messages is scanned
- **THEN** it appears in the session list

#### Scenario: Genuinely empty transcript stays hidden

- **WHEN** a transcript contains only metadata records and no user or assistant exchange
- **THEN** it is omitted from the session list

### Requirement: pi sessions are discovered without configuration

pi's default session location SHALL be scanned out of the box. A configured session directory
that does not exist SHALL be skipped silently, so readers who do not use pi see no change and
no error.

#### Scenario: pi is installed

- **WHEN** the reader opens the session browser and pi transcripts exist in pi's default location
- **THEN** those sessions are listed without the reader configuring anything

#### Scenario: pi is not installed

- **WHEN** pi's default session location does not exist
- **THEN** the scan completes normally and reports no error

### Requirement: pi records are presented as turns and content blocks

A pi transcript SHALL be presented using the same turn and content-block vocabulary as any
other format, so that rendering, search, export and distillation work without special cases.

At minimum: assistant reasoning appears as thinking content, tool invocations appear as tool
calls with their arguments, tool outputs appear as tool results attached to their invocation,
failed tool outputs are marked as errors, and shell executions appear as command blocks
carrying their command, output and exit status.

#### Scenario: Reasoning and tool call in one assistant turn

- **WHEN** a pi assistant message contains both reasoning and a tool invocation
- **THEN** the turn shows a collapsible thinking block and a tool call with its arguments

#### Scenario: Tool output is attached to its invocation

- **WHEN** a pi tool result follows the invocation it belongs to
- **THEN** the result is displayed with that tool call rather than as a separate turn

#### Scenario: Failed tool output

- **WHEN** a pi tool result is marked as an error
- **THEN** it is presented as a failed result

#### Scenario: Shell execution

- **WHEN** a pi transcript records a shell execution
- **THEN** the command, its output and its exit status are shown

### Requirement: Session identity and ordering work for every format

Every listed session SHALL report its own identifier, working directory, project name, start
time and last-prompt time, so that ordering, search and deep links behave identically across
formats.

#### Scenario: pi session ordering

- **WHEN** the session list is ordered by last prompt
- **THEN** pi sessions are interleaved with Claude sessions in true recency order

#### Scenario: pi project name

- **WHEN** a pi session is listed
- **THEN** its project name is derived from the working directory the transcript records

### Requirement: Reported cost is the cost the agent recorded

Where a transcript records its own cost, the viewer SHALL report that recorded figure. The
viewer SHALL NOT apply one provider's price list to a model served by another provider.

#### Scenario: pi session on a non-Anthropic model

- **WHEN** a pi session ran a model from another provider and recorded its own cost
- **THEN** the reported cost is the figure the transcript recorded

#### Scenario: Token counts

- **WHEN** a pi session is summarised
- **THEN** input, output, cache-read and cache-write token counts reflect the transcript's own usage figures

#### Scenario: No recorded cost

- **WHEN** a transcript records usage but no cost, and no price list applies to its model
- **THEN** the summary omits a cost figure rather than showing a misleading one
