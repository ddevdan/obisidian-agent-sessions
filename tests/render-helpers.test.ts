import { describe, it, expect } from 'vitest';
import { normalizeMarkdown, stripFenceMarkers, hasSelectionInside, makeClickable } from '../src/views/render-helpers';

describe('normalizeMarkdown', () => {
	it('inserts a blank line before a GFM table', () => {
		expect(normalizeMarkdown('intro\n| a | b |\n|---|---|\n| 1 | 2 |'))
			.toBe('intro\n\n| a | b |\n|---|---|\n| 1 | 2 |');
	});

	// A block opening with `---` was read as a YAML frontmatter delimiter by
	// MarkdownRenderer, swallowing everything up to the next `---`.
	it('rewrites a leading thematic break so it is not parsed as frontmatter', () => {
		expect(normalizeMarkdown('---\n\n**report**\n\nbody\n\n---'))
			.toBe('***\n\n**report**\n\nbody\n\n---');
	});

	it('rewrites a bare leading thematic break', () => {
		expect(normalizeMarkdown('---')).toBe('***');
	});

	it('leaves a setext heading underline alone', () => {
		expect(normalizeMarkdown('Heading\n---\nbody')).toBe('Heading\n---\nbody');
	});

	it('leaves a longer dash run alone', () => {
		expect(normalizeMarkdown('----\nbody')).toBe('----\nbody');
	});
});

describe('stripFenceMarkers', () => {
	it('removes a wrapping fence', () => {
		expect(stripFenceMarkers('```\n  ███\n  ░░░\n```')).toBe('  ███\n  ░░░');
	});

	it('removes a fence with a language tag', () => {
		expect(stripFenceMarkers('```ts\nconst a = 1;\n```')).toBe('const a = 1;');
	});

	it('removes a tilde fence', () => {
		expect(stripFenceMarkers('~~~\nart\n~~~')).toBe('art');
	});

	// The most common real shape: fenced art followed by explanatory prose.
	it('removes a mid-string closing fence, keeping trailing prose', () => {
		expect(stripFenceMarkers('```\n  ███\n```\nMETAPHOR:\n• idle: hops'))
			.toBe('  ███\nMETAPHOR:\n• idle: hops');
	});

	it('removes an unclosed opening fence', () => {
		expect(stripFenceMarkers('```\nart')).toBe('art');
	});

	it('leaves unfenced ASCII art untouched', () => {
		const art = '┌────────┐\n│ Agent  │\n└────────┘';
		expect(stripFenceMarkers(art)).toBe(art);
	});

	it('preserves interior blank lines and indentation', () => {
		expect(stripFenceMarkers('```\n  a\n\n    b\n```')).toBe('  a\n\n    b');
	});

	it('leaves inline backticks alone', () => {
		expect(stripFenceMarkers('use `foo` here')).toBe('use `foo` here');
	});

	// Real corpus case: a tilde run is a dirt mound, not a fence — the trailing
	// annotation is what keeps it from looking like one.
	it('keeps a tilde run that carries trailing content', () => {
		const art = '   /\\\\\n ~~~~~~~~~~~ <- dirt mound';
		expect(stripFenceMarkers(art)).toBe(art);
	});
});

/* ── Text-selection guard ──
 * No DOM environment is configured (and adding one would mean a new dependency),
 * so these use hand-rolled stubs. Node's EventTarget honours both the capture
 * flag and stopImmediatePropagation() across registration order, which is
 * exactly the behaviour makeClickable() relies on.
 */

interface FakeSelection {
	isCollapsed: boolean;
	rangeCount: number;
	anchorNode: unknown;
	focusNode: unknown;
}

function selection(over: Partial<FakeSelection> = {}): FakeSelection {
	return { isCollapsed: false, rangeCount: 1, anchorNode: null, focusNode: null, ...over };
}

class FakeElement extends EventTarget {
	attrs: Record<string, string> = {};
	selection: FakeSelection | null = null;
	/** Nodes this element reports as descendants. */
	descendants = new Set<unknown>();
	ownerDocument = { defaultView: { getSelection: () => this.selection } };

	setAttribute(name: string, value: string): void {
		this.attrs[name] = value;
	}

	contains(node: unknown): boolean {
		return this.descendants.has(node);
	}

	/** Dispatch a click. detail 0 mimics el.click(); detail 1 mimics a pointer click. */
	dispatchClick(detail: number): void {
		const event = new Event('click');
		Object.defineProperty(event, 'detail', { value: detail });
		this.dispatchEvent(event);
	}

	get asHtmlElement(): HTMLElement {
		return this as unknown as HTMLElement;
	}
}

describe('hasSelectionInside', () => {
	const inside = Symbol('inside');
	const outside = Symbol('outside');

	function element(sel: FakeSelection | null): FakeElement {
		const el = new FakeElement();
		el.selection = sel;
		el.descendants.add(inside);
		return el;
	}

	it('is false when there is no selection at all', () => {
		expect(hasSelectionInside(element(null).asHtmlElement)).toBe(false);
	});

	it('is false for a collapsed selection (a plain caret placement)', () => {
		const sel = selection({ isCollapsed: true, anchorNode: inside, focusNode: inside });
		expect(hasSelectionInside(element(sel).asHtmlElement)).toBe(false);
	});

	it('is false when the selection reports no ranges', () => {
		const sel = selection({ rangeCount: 0, anchorNode: inside, focusNode: inside });
		expect(hasSelectionInside(element(sel).asHtmlElement)).toBe(false);
	});

	it('is true when the selection sits inside the element', () => {
		const sel = selection({ anchorNode: inside, focusNode: inside });
		expect(hasSelectionInside(element(sel).asHtmlElement)).toBe(true);
	});

	// A sibling row's selection must not block clicking this one.
	it('is false when the selection sits in a sibling container', () => {
		const sel = selection({ anchorNode: outside, focusNode: outside });
		expect(hasSelectionInside(element(sel).asHtmlElement)).toBe(false);
	});

	// Dragging upward out of a tool body onto its header: anchor stays in the
	// body, focus lands in the header.
	it('is true when only the focus reaches into the element', () => {
		const sel = selection({ anchorNode: outside, focusNode: inside });
		expect(hasSelectionInside(element(sel).asHtmlElement)).toBe(true);
	});

	it('is true when only the anchor reaches into the element', () => {
		const sel = selection({ anchorNode: inside, focusNode: outside });
		expect(hasSelectionInside(element(sel).asHtmlElement)).toBe(true);
	});
});

describe('makeClickable selection guard', () => {
	const inside = Symbol('inside');

	function clickable(): { el: FakeElement; calls: () => number } {
		const el = new FakeElement();
		el.descendants.add(inside);
		makeClickable(el.asHtmlElement, { label: 'Toggle', expanded: true });
		let count = 0;
		el.addEventListener('click', () => { count += 1; });
		return { el, calls: () => count };
	}

	it('swallows a pointer click that terminates a selection inside the element', () => {
		const { el, calls } = clickable();
		el.selection = selection({ anchorNode: inside, focusNode: inside });
		el.dispatchClick(1);
		expect(calls()).toBe(0);
	});

	it('lets a pointer click through when nothing is selected', () => {
		const { el, calls } = clickable();
		el.dispatchClick(1);
		expect(calls()).toBe(1);
	});

	// The Enter/Space handler calls el.click(), which reports detail 0. Keyboard
	// activation must work even while unrelated text is selected.
	it('lets a synthetic click through even with a selection inside', () => {
		const { el, calls } = clickable();
		el.selection = selection({ anchorNode: inside, focusNode: inside });
		el.dispatchClick(0);
		expect(calls()).toBe(1);
	});

	it('still sets the accessibility attributes', () => {
		const { el } = clickable();
		expect(el.attrs).toMatchObject({ tabindex: '0', role: 'button', 'aria-expanded': 'true' });
	});
});
