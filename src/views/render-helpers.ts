import { MarkdownRenderer, setIcon } from 'obsidian';
import type { App, Component } from 'obsidian';
import type { PluginSettings, HookSuccessEvent, AsyncHookResponseEvent } from '../types';

/** Hook events that can be displayed inline with tool calls. */
export type InlineHookEvent = HookSuccessEvent | AsyncHookResponseEvent;

/** Shared context passed to all renderer functions. */
export interface RenderContext {
	app: App;
	component: Component;
	settings: PluginSettings;
	/** Map of toolUseId → InlineHookEvent[] for inline hook indicators */
	hookEventsByToolId?: Map<string, InlineHookEvent[]>;
}

/** Stable hook applied to every destination that contains rendered session Markdown. */
export const SESSION_MARKDOWN_CLASS = 'claude-sessions-markdown-content';

/** Mark and render one session Markdown surface through Obsidian's renderer. */
export function renderSessionMarkdown(
	markdown: string,
	destination: HTMLElement,
	ctx: RenderContext,
): void {
	destination.classList.add(SESSION_MARKDOWN_CLASS);
	void MarkdownRenderer.render(ctx.app, markdown, destination, '', ctx.component);
}

export const COLLAPSE_THRESHOLD = 10;

/** Map file extensions to markdown fence language identifiers. */
const EXT_TO_LANG: Record<string, string> = {
	ts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
	py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
	java: 'java', kt: 'kotlin', cs: 'csharp', cpp: 'cpp', c: 'c', h: 'c',
	swift: 'swift', m: 'objectivec',
	sh: 'bash', zsh: 'bash', bash: 'bash', fish: 'fish',
	json: 'json', jsonl: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
	xml: 'xml', html: 'html', css: 'css', scss: 'scss', less: 'less',
	sql: 'sql', graphql: 'graphql', gql: 'graphql',
	md: 'markdown', mdx: 'mdx', tex: 'latex',
	dockerfile: 'dockerfile', makefile: 'makefile',
	lua: 'lua', r: 'r', pl: 'perl', php: 'php', ex: 'elixir', erl: 'erlang',
	hs: 'haskell', ml: 'ocaml', scala: 'scala', clj: 'clojure',
	vue: 'vue', svelte: 'svelte', astro: 'astro',
	tf: 'hcl', hcl: 'hcl', nix: 'nix', zig: 'zig', v: 'v',
};

/** Strip `cat -n` style line numbers: digits + arrow/tab separator */
export function stripLineNumbers(text: string): string {
	return text.replace(/^\d+[\u2192\t]/gm, '');
}

/** Extract language from a file path's extension. */
export function langFromPath(filePath: string): string {
	const basename = filePath.split('/').pop() ?? '';
	const lowerBase = basename.toLowerCase();
	if (lowerBase === 'makefile') return 'makefile';
	if (lowerBase === 'dockerfile') return 'dockerfile';
	const ext = basename.split('.').pop()?.toLowerCase() ?? '';
	return EXT_TO_LANG[ext] ?? '';
}

/** Convert full model ID to short display name, e.g. "claude-opus-4-6-20250514" → "opus 4.6". */
export function shortModelName(model: string): string {
	// New format: claude-opus-4-6[-date]
	let m = model.match(/claude-(opus|sonnet|haiku)-(\d+)-(\d+)/);
	if (m) return `${m[1]} ${m[2]}.${m[3]}`;
	// Old format: claude-3-5-sonnet[-date]
	m = model.match(/claude-(\d+)-(\d+)-(opus|sonnet|haiku)/);
	if (m) return `${m[3]} ${m[1]}.${m[2]}`;
	return model;
}

/** Return a backtick fence string (at least 3) that won't collide with content. */
export function fence(content: string, lang = ''): string {
	let max = 2;
	const re = /`{3,}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(content)) !== null) {
		if (m[0].length > max) max = m[0].length;
	}
	const ticks = '`'.repeat(max + 1);
	return ticks + lang + '\n' + content + '\n' + ticks;
}

/**
 * Drop standalone code-fence marker lines.
 *
 * AskUserQuestion previews arrive in three shapes: bare ASCII, fully fenced,
 * and fenced art followed by trailing prose. All three render as preformatted
 * text, so the markers carry no meaning and would show up literally. Only
 * lines that are nothing but a fence are removed, so content keeps its exact
 * alignment. A preview deliberately showing a fence as content would lose it —
 * no such case exists in practice, and mangled ASCII art is the worse failure.
 */
export function stripFenceMarkers(text: string): string {
	const lines = text.replace(/\s+$/, '').split('\n');
	const kept = lines.filter(l => !/^\s*(?:`{3,}|~{3,})[^\s`~]*\s*$/.test(l));
	return kept.length === lines.length ? text : kept.join('\n');
}

/** Opening or closing marker of a fenced code block. */
const RE_FENCE_MARKER = /^\s*(`{3,}|~{3,})/;

/** A GFM delimiter row — only pipes, dashes, colons and spaces, with at least one of each. */
function isDelimiterRow(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.includes('-') && trimmed.includes('|') && /^[-:|\s]+$/.test(trimmed);
}

/** Cell count of a table row, ignoring the optional outer pipes. */
function countCells(row: string): number {
	return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').length;
}

/**
 * Make GFM tables parse the way they were meant to.
 *
 * Two repairs, both driven by what real session content looks like:
 *
 * 1. CommonMark needs a blank line between a paragraph and a table that follows it,
 *    otherwise the table is swallowed into the paragraph.
 * 2. Model-authored tables sometimes pipe the header and delimiter rows but not the body:
 *
 *        | Test | Output | Finding |
 *        |---|---|---|
 *        `test_name` | `assert 2.01 < 1.5` | prep phase unbounded |
 *
 *    Obsidian closes the table after the delimiter, so the body renders as a paragraph
 *    with the pipes showing as literal text. ~4% of tables in a real corpus look like this.
 *
 * Both run in a single fence-aware pass. Fenced code blocks are skipped entirely — a
 * table-shaped block inside a fence is code being displayed, and editing it would corrupt
 * what the reader is meant to see.
 *
 * A body row is only adopted if it carries at least `columns - 1` pipes, so prose that
 * merely happens to contain a pipe closes the table instead of being pulled into it.
 */
function normalizeTables(text: string): string {
	const lines = text.split('\n');
	const out: string[] = [];
	let fenceChar = '';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		const marker = RE_FENCE_MARKER.exec(line);
		if (marker) {
			if (!fenceChar) fenceChar = marker[1][0];
			else if (marker[1][0] === fenceChar) fenceChar = '';
			out.push(line);
			continue;
		}
		if (fenceChar) {
			out.push(line);
			continue;
		}

		// A row containing a pipe, followed by a delimiter row, opens a table.
		const opensTable = line.includes('|')
			&& !isDelimiterRow(line)
			&& i + 1 < lines.length
			&& isDelimiterRow(lines[i + 1]);
		if (!opensTable) {
			out.push(line);
			continue;
		}

		// Separate the table from a preceding paragraph. Skipped when the previous line is
		// itself a table row, so two adjacent tables aren't split apart.
		const prev = out[out.length - 1];
		if (prev !== undefined && prev.trim() !== '' && !/^\s*\|/.test(prev)) out.push('');

		out.push(line);
		out.push(lines[i + 1]);

		const minPipes = Math.max(1, countCells(line) - 1);
		let j = i + 2;
		for (; j < lines.length; j++) {
			const row = lines[j];
			if (!row.trim()) break;                        // blank line closes the table
			if (RE_FENCE_MARKER.test(row)) break;
			if (/^\s*\|/.test(row)) {                      // already a well-formed row
				out.push(row);
				continue;
			}
			if ((row.match(/\|/g) ?? []).length < minPipes) break;
			const indent = /^\s*/.exec(row)?.[0] ?? '';
			out.push(`${indent}| ${row.slice(indent.length)}`);
		}
		i = j - 1;
	}

	return out.join('\n');
}

/**
 * Repair GFM tables (see `normalizeTables`) and defuse a leading `---` so Obsidian
 * doesn't read the block as YAML frontmatter.
 */
export function normalizeMarkdown(text: string): string {
	const withTables = normalizeTables(text);
	// A text block opening with `---` is a thematic break, but MarkdownRenderer treats
	// it as a frontmatter delimiter and swallows everything up to the next `---` —
	// rendering the turn blank. `***` is the equivalent break with no such ambiguity.
	return withTables.replace(/^[ \t]*---[ \t]*(?=\n|$)/, '***');
}

/**
 * Whether a non-empty text selection currently reaches into `el`.
 *
 * True when the selection's anchor or focus sits inside `el` — the two gestures
 * that end with a click on a clickable element: selecting text inside it, and
 * dragging upward out of a sibling body onto its header.
 *
 * NOTE: mirrored in `standalone-player.ts` (`selectionTouches`) for exported
 * HTML, which cannot import from this module. Keep the two in sync.
 */
export function hasSelectionInside(el: HTMLElement): boolean {
	const sel = el.ownerDocument.defaultView?.getSelection();
	if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
	return (!!sel.anchorNode && el.contains(sel.anchorNode))
		|| (!!sel.focusNode && el.contains(sel.focusNode));
}

/** Make a clickable div keyboard-accessible: tabindex, role, aria attrs, Enter/Space handler. */
export function makeClickable(el: HTMLElement, opts: {
	label?: string; role?: string; expanded?: boolean;
}): void {
	el.setAttribute('tabindex', '0');
	el.setAttribute('role', opts.role ?? 'button');
	if (opts.label) el.setAttribute('aria-label', opts.label);
	if (opts.expanded !== undefined) el.setAttribute('aria-expanded', String(opts.expanded));
	// Swallow the click that terminates a text selection so reading gestures never
	// toggle or navigate. Capture phase + stopImmediatePropagation() halts the whole
	// dispatch, so callers MUST attach their own click handler after this call.
	// `detail === 0` marks a synthetic click (the Enter/Space handler below), which
	// must still act regardless of any selection.
	el.addEventListener('click', (e: MouseEvent) => {
		if (e.detail > 0 && hasSelectionInside(el)) e.stopImmediatePropagation();
	}, true);
	el.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			el.click();
		}
	});
}

export function formatElapsed(ms: number): string {
	if (ms <= 0) return '0:00';
	const totalSec = Math.round(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

/** Add a copy-to-clipboard button with icon swap feedback. */
export function addCopyButton(container: HTMLElement, text: string, label: string, cls = 'claude-sessions-summary-copy'): void {
	const btn = container.createEl('button', {
		cls: `${cls} clickable-icon`,
		attr: { 'aria-label': label, 'data-tooltip-position': 'top', 'data-copy-text': text },
	});
	setIcon(btn, 'copy');
	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		void navigator.clipboard.writeText(text);
		setIcon(btn, 'check');
		window.setTimeout(() => setIcon(btn, 'copy'), 1500);
	});
}
