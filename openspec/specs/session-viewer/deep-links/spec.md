# session-viewer/deep-links Specification

## Purpose
Defines the URI links that open a session in the viewer, and guarantees that links already
minted and saved — in distilled notes, exported files, and external scripts — keep resolving
after the plugin's identity stops naming a single agent.

## Requirements

### Requirement: A session opens from a provider-neutral link

The plugin SHALL answer a provider-neutral protocol link that opens a session identified by
its transcript path, whatever format that transcript is in.

#### Scenario: Opening a session by link

- **WHEN** a provider-neutral session link naming an existing transcript path is activated
- **THEN** the viewer opens that session

#### Scenario: A path using a home-directory shorthand

- **WHEN** the link's path begins with a home-directory shorthand
- **THEN** the path is expanded and the session opens

#### Scenario: A pi session by link

- **WHEN** the link names a pi transcript
- **THEN** the viewer opens it, the same as for any other format

### Requirement: Links minted under the previous scheme keep working

The previous, Claude-named protocol link SHALL continue to resolve for the same inputs and with
the same behaviour. Rebranding SHALL NOT invalidate any link that resolves today.

This is a compatibility guarantee, not a transitional courtesy: these links are written into
distilled notes and exported artifacts that the plugin does not control and cannot rewrite.

#### Scenario: A link saved in an existing note

- **WHEN** a reader activates a session link that was written into a note before the rebrand
- **THEN** the session opens exactly as it did before

#### Scenario: Both schemes reach the same session

- **WHEN** the same transcript path is opened once under each scheme
- **THEN** both open the same session

### Requirement: A link may target a specific turn

Both schemes SHALL accept an optional turn position and scroll to it when opening.

#### Scenario: Link with a turn position

- **WHEN** a session link carries a turn position
- **THEN** the session opens scrolled to that turn

#### Scenario: Link without a turn position

- **WHEN** a session link carries no turn position
- **THEN** the session opens at its default position

### Requirement: A malformed link reports why

A link that cannot be resolved SHALL tell the reader what was wrong instead of failing
silently or opening an empty view.

#### Scenario: Missing session

- **WHEN** a session link carries no transcript path
- **THEN** the reader is told the session parameter is missing

#### Scenario: Path that does not exist

- **WHEN** a session link names a path that cannot be read
- **THEN** the reader is told the session could not be loaded

#### Scenario: Unrecognised format

- **WHEN** a session link names a file whose format cannot be detected
- **THEN** the reader is told the format could not be detected
