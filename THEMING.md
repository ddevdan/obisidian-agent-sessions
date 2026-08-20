# Theming

Agent Sessions exposes CSS custom properties (`--cs-*`) that you can override via [Obsidian CSS snippets](https://help.obsidian.md/Extending+Obsidian/CSS+snippets). Application chrome, controls, dashboards, and semantic states use Obsidian variables by default. Rendered session Markdown is the deliberate exception: it uses the compact typography and pinned light/dark semantic palettes described below.

## Quick start

1. Create a `.css` file in your vault's `.obsidian/snippets/` folder
2. Override any `--cs-*` variable on `.claude-sessions-timeline-container`
3. Enable the snippet in **Settings > Appearance > CSS Snippets**

```css
/* .obsidian/snippets/my-claude-theme.css */
.claude-sessions-timeline-container {
  --cs-accent: #7c3aed;
  --cs-role-user: #7c3aed;
  --cs-role-assistant: #06b6d4;
  --cs-tool-name: #06b6d4;
  --cs-thinking-opacity: 0.3;
}
```

For light/dark variants, scope with the body class:

```css
.theme-light .claude-sessions-timeline-container {
  --cs-accent: #7c3aed;
}
.theme-dark .claude-sessions-timeline-container {
  --cs-accent: #a78bfa;
}
```

## Example theme

A complete Claude brand theme is included at [`examples/claude-sessions-theme-claude.css`](examples/claude-sessions-theme-claude.css). Copy it to `.obsidian/snippets/` and enable it to try it out.

## Session Markdown default

Every Markdown surface in both Claude Code and pi transcripts uses the Pi-derived treatment: top-level user and assistant text, thinking, slash-command output, direct bash blocks, compaction summaries, tool input and results, rendered Markdown previews, and sub-agent output. It is a presentation change only; the surrounding headers, controls, dashboards, status decoration, and other programmatic UI remain Obsidian-derived.

Obsidian's active `.theme-light` or `.theme-dark` ancestor selects the palette. The plugin does not evaluate `prefers-color-scheme` itself, so an explicit Obsidian mode wins and Obsidian's system-adaptive mode continues to work. Standalone HTML exports retain the active class and embed the same core rules.

All destinations rendered through Obsidian's `MarkdownRenderer` receive this stable hook:

```css
.claude-sessions-timeline-container .claude-sessions-markdown-content {
  /* Overrides every session Markdown surface in both transcript formats. */
}
```

Prefer the `--cs-md-*` properties below for typography and color changes. The hook is available when an element-level override is necessary:

```css
.claude-sessions-timeline-container {
  --cs-md-font-size: 14px;
  --cs-md-line-height: 21px;
}

.theme-light .claude-sessions-timeline-container {
  --cs-md-text: var(--text-normal);
  --cs-md-heading: var(--text-accent);
}

.theme-dark .claude-sessions-timeline-container {
  --cs-md-text: var(--text-normal);
  --cs-md-heading: var(--text-accent);
}
```

The treatment adapts the Markdown rules and semantic colors from [pi's HTML export template](https://github.com/earendil-works/pi/blob/5cd93f688aaab89dbb6dfa4aca535f21796ae185/packages/coding-agent/src/core/export-html/template.css), [`dark.json`](https://github.com/earendil-works/pi/blob/5cd93f688aaab89dbb6dfa4aca535f21796ae185/packages/coding-agent/src/modes/interactive/theme/dark.json), and [`light.json`](https://github.com/earendil-works/pi/blob/5cd93f688aaab89dbb6dfa4aca535f21796ae185/packages/coding-agent/src/modes/interactive/theme/light.json), pinned at commit `5cd93f688aaab89dbb6dfa4aca535f21796ae185`. pi is distributed under the [MIT License](https://github.com/earendil-works/pi/blob/5cd93f688aaab89dbb6dfa4aca535f21796ae185/LICENSE), Copyright (c) 2025 Mario Zechner. The plugin adapts only Markdown presentation—not pi's page shell, cards, sidebars, or message backgrounds.

## Available variables

### Accent & brand

| Variable | Default | Description |
|---|---|---|
| `--cs-accent` | `var(--interactive-accent)` | Primary interactive/accent color |
| `--cs-accent-hover` | `var(--interactive-accent-hover)` | Accent hover state |
| `--cs-accent-rgb` | `var(--interactive-accent-rgb)` | RGB triplet for `rgba()` usage |
| `--cs-accent-subtle` | `rgba(--cs-accent-rgb, 0.08)` | Low-opacity accent background |

### Role colors

| Variable | Default | Description |
|---|---|---|
| `--cs-role-user` | `var(--interactive-accent)` | User role badge and left border |
| `--cs-role-assistant` | `var(--color-cyan)` | Assistant role badge and left border |
| `--cs-role-border-width` | `3px` | Left border width on role sections |

### Tool & component colors

| Variable | Default | Description |
|---|---|---|
| `--cs-tool-indicator` | `var(--color-blue)` | Tool status dot |
| `--cs-tool-name` | `var(--color-cyan)` | Tool name text |
| `--cs-tool-group-header` | `var(--color-cyan)` | Tool group header text |
| `--cs-subagent-border` | `var(--color-orange)` | Sub-agent timeline left border |
| `--cs-progress-fill` | `var(--interactive-accent)` | Progress/scrub bar fill |

### Badge backgrounds

| Variable | Default | Description |
|---|---|---|
| `--cs-badge-error-bg` | `rgba(248, 81, 73, 0.15)` | Stop reason badge |
| `--cs-badge-warning-bg` | `rgba(210, 153, 34, 0.15)` | API error badge |
| `--cs-diff-del-bg` | `rgba(248, 81, 73, 0.1)` | Diff deletion highlight |
| `--cs-diff-add-bg` | `rgba(63, 185, 80, 0.1)` | Diff addition highlight |
| `--cs-ansi-bg-text` | `#1a1a1a` | ANSI background text color |

### Spacing

| Variable | Default | Description |
|---|---|---|
| `--cs-turn-gap` | `var(--size-4-6)` (24px) | Space between turns |
| `--cs-block-gap` | `var(--size-2-3)` (6px) | Space between tool/thinking/slash blocks |
| `--cs-padding-header` | `var(--size-2-3) 10px` | Padding inside collapsible headers |
| `--cs-padding-tool-body` | `var(--size-4-2) 10px` | Padding inside tool body panels |
| `--cs-padding-badge` | `1px 6px` | Padding inside small badges/pills |
| `--cs-padding-card` | `10px 6px 8px` | Dashboard hero card padding |
| `--cs-collapse-height` | `13em` | Max height before "Show more" |
| `--cs-max-scroll-height` | `400px` | Max scroll height for body panels |
| `--cs-max-scroll-height-sm` | `300px` | Max scroll height for tool input/result |

### Typography

| Variable | Default | Description |
|---|---|---|
| `--cs-font-family` | `var(--font-monospace)` | Main container and code blocks |
| `--cs-font-family-ui` | `var(--font-ui)` | Buttons, toggles, labels |
| `--cs-font-family-text` | `var(--font-text)` | Compatibility declaration retained for existing snippets; session Markdown uses `--cs-md-font-family` |
| `--cs-font-size-base` | `var(--font-ui-small)` (13px) | Base font size |
| `--cs-font-size-xs` | `11px` | Small text (labels, timestamps) |
| `--cs-font-size-hero` | `18px` | Dashboard hero stat value |
| `--cs-font-size-input` | `14px` | Search input font size |
| `--cs-line-height` | `1.6` | Base line height |
| `--cs-line-height-code` | `1.4` | Compatibility declaration retained for existing snippets; session Markdown uses `--cs-md-line-height` |
| `--cs-letter-spacing-caps` | `0.5px` | Uppercase label letter spacing |

### Session Markdown

| Variable | Light default | Dark default | Semantic effect |
|---|---|---|---|
| `--cs-md-font-family` | `ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace` | `ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace` | Font stack for all rendered session Markdown |
| `--cs-md-font-size` | `12px` | `12px` | Markdown text and code size |
| `--cs-md-line-height` | `18px` | `18px` | Markdown line rhythm and block spacing unit |
| `--cs-md-text` | `#1f2328` | `#d4d4d4` | Normal Markdown and fenced-code text |
| `--cs-md-heading` | `#9a7326` | `#f0c674` | Heading text |
| `--cs-md-link` | `#547da7` | `#81a2be` | Link text |
| `--cs-md-inline-code` | `#5a8080` | `#8abeb7` | Inline-code text |
| `--cs-md-quote-text` | `#6c6c6c` | `#808080` | Blockquote text |
| `--cs-md-quote-border` | `#6c6c6c` | `#808080` | Blockquote left rule |
| `--cs-md-rule` | `#6c6c6c` | `#808080` | Horizontal rule |
| `--cs-md-list-marker` | `#588458` | `#8abeb7` | Ordered and unordered list markers |
| `--cs-md-table-border` | `#6c6c6c` | `#808080` | Markdown table borders |
| `--cs-md-syntax-comment` | `#008000` | `#6A9955` | Prism comments, prologs, doctypes, and CDATA |
| `--cs-md-syntax-keyword` | `#0000FF` | `#569CD6` | Prism keywords and at-rules |
| `--cs-md-syntax-function` | `#795E26` | `#DCDCAA` | Prism function names |
| `--cs-md-syntax-variable` | `#001080` | `#9CDCFE` | Prism variables, properties, attributes, and parameters |
| `--cs-md-syntax-string` | `#A31515` | `#CE9178` | Prism strings, characters, attribute values, and regexes |
| `--cs-md-syntax-number` | `#098658` | `#B5CEA8` | Prism numbers, booleans, and constants |
| `--cs-md-syntax-type` | `#267F99` | `#4EC9B0` | Prism class names and built-ins |
| `--cs-md-syntax-operator` | `#000000` | `#D4D4D4` | Prism operators |
| `--cs-md-syntax-punctuation` | `#000000` | `#D4D4D4` | Prism punctuation |

Inline-code and table-header backgrounds use pi's mode-independent translucent neutral fills (`rgba(128, 128, 128, 0.2)` and `rgba(128, 128, 128, 0.1)`). They are structural constants rather than palette properties.

### Visual effects

| Variable | Default | Description |
|---|---|---|
| `--cs-thinking-opacity` | `0.55` | Thinking block resting opacity |
| `--cs-thinking-opacity-hover` | `0.85` | Thinking block hover opacity |
| `--cs-bar-opacity` | `0.75` | Tool usage bar opacity |

### Component dimensions

| Variable | Default | Description |
|---|---|---|
| `--cs-indicator-size` | `8px` | Tool status dot diameter |
| `--cs-bar-height` | `10px` | Stacked bar chart track height |
| `--cs-bar-height-sm` | `8px` | Tool usage bar height |
| `--cs-progress-height` | `12px` | Scrub bar height |
| `--cs-thumb-max-w` | `200px` | Image thumbnail max width |
| `--cs-thumb-max-h` | `150px` | Image thumbnail max height |

## What stays Obsidian-derived

The Pi-derived boundary ends at `.claude-sessions-markdown-content`. These surrounding concerns continue to use Obsidian's theme and interaction language:

- **Application and chrome text** (`--text-normal`, `--text-muted`, `--text-faint`)
- **Semantic states** (`--color-red`, `--color-green`, `--color-yellow`) for errors, success, and warnings
- **Surface backgrounds and borders** for turns, tools, dashboards, system events, and controls
- **Border radii** (`--radius-s`, `--radius-m`)
- **Accessibility targets and focus indicators**
- **Animation timings and interaction behavior**

The fixed pi literals can contrast differently against unusual community-theme backgrounds. Verification with Minimal 9.0.2 and AnuPpuccin 1.5.0 found that the light heading, link, and inline-code colors (about 3.55–3.98:1) and the dark quote color (about 4.08–4.45:1) can fall below 4.5:1 against those themes' message surfaces. The pinned defaults remain unchanged by design. Override the documented `--cs-md-*` properties for that theme rather than broadening the Pi-derived rules into non-Markdown UI.
