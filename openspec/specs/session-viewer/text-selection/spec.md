# session-viewer/text-selection Specification

## Purpose
Defines what a reader can select and copy with the mouse and keyboard while viewing a
Claude Code session in a plugin view, and which interactive regions are deliberately
excluded from selection so that reading gestures never conflict with expand/collapse
gestures.

## Requirements

### Requirement: Session content is selectable

Text rendered as session content in a plugin-owned view SHALL be selectable by the reader
using the pointer and the platform's standard selection gestures, and the selected text
SHALL be copyable with the platform copy shortcut.

Session content covers, at minimum:

- user and assistant message text within a turn body
- thinking block text
- tool input and tool result text, including preformatted and code-fenced regions
- diff bodies and file paths in Edit/Write blocks
- terminal output, including ANSI-colored output
- summary dashboard values and metadata
- system events panel entries
- search result snippets

#### Scenario: Reader drags across assistant message text

- **WHEN** the reader presses the pointer inside an assistant turn body and drags across
  several words
- **THEN** the traversed text is visually highlighted as a selection
- **AND** the platform copy shortcut places exactly that text on the clipboard

#### Scenario: Reader double-clicks a word in tool output

- **WHEN** the reader double-clicks a word inside a tool result body
- **THEN** that word is selected

#### Scenario: Reader selects across preformatted output

- **WHEN** the reader drags a selection across lines of terminal output that carry ANSI
  color styling
- **THEN** the selection covers the traversed lines
- **AND** the copied text contains the visible characters without ANSI escape sequences

#### Scenario: Reader selects text in the summary and system events panels

- **WHEN** the reader drags across a value in the summary dashboard or an entry in the
  system events panel
- **THEN** that text is selected and copyable

### Requirement: Interactive chrome is excluded from selection

Interactive chrome SHALL remain non-selectable so that a pointer drag beginning on chrome
performs its control action rather than starting a text selection.

Interactive chrome covers, at minimum: collapsible headers (turn, tool, tool group,
thinking, slash command, sub-agent prompt, summary, system events, AskUserQuestion
preview), show-more/show-less toggles, icon buttons, copy and download buttons, and view
filter and control bars.

#### Scenario: Drag starting on a collapsible header

- **WHEN** the reader presses the pointer on a turn header and drags across it
- **THEN** no text selection appears
- **AND** releasing the pointer on that header toggles the turn's collapsed state

### Requirement: Selection does not trigger collapse

When a click event reaches a collapsible header or toggle control and a non-empty text
selection exists inside that control's block at that moment, the control SHALL NOT change
its expanded state.

#### Scenario: Selection drag ends over a header

- **WHEN** the reader starts a selection inside an expanded block's body and the pointer
  release lands such that the click event reaches that block's header
- **THEN** the block stays expanded
- **AND** the selection is preserved

#### Scenario: Plain click with no selection

- **WHEN** the reader clicks a collapsible header with no text selected
- **THEN** the block toggles between expanded and collapsed

### Requirement: Keyboard activation is unaffected

Keyboard activation of collapsible controls SHALL continue to work regardless of any
active text selection.

#### Scenario: Enter on a focused header while text is selected

- **WHEN** a collapsible header has keyboard focus, text is selected elsewhere in the
  view, and the reader presses Enter or Space
- **THEN** the block toggles its expanded state

### Requirement: Exported HTML matches in-app selection behavior

An exported standalone HTML session SHALL present the same selection behavior as the
in-app view: session content selectable, interactive chrome not selectable, and a
selection-terminating click not toggling a block.

#### Scenario: Reader selects text in an exported session

- **WHEN** the reader opens an exported HTML session in a browser and drags across
  assistant message text
- **THEN** the text is selected and copyable
- **AND** the block containing it stays expanded
