import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { captureAllCSS } from '../src/exporters/css-capture';

const ROOT = process.cwd();
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

function ruleBody(selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
	if (!match) throw new Error(`Missing CSS rule: ${selector}`);
	return match[1];
}

function declarations(selector: string): Record<string, string> {
	return Object.fromEntries(
		[...ruleBody(selector).matchAll(/(--[\w-]+):\s*([^;]+);/g)]
			.map(([, name, value]) => [name, value.trim()]),
	);
}

function piMarkdownSection(): string {
	const start = css.indexOf('/*\n * Session Markdown adapted from pi');
	const end = css.indexOf('/* ═══════════════════════════════════════════\n   Collapsible long content', start);
	if (start < 0 || end < 0) throw new Error('Missing attributed Pi Markdown section');
	return css.slice(start, end);
}

describe('Pi-derived session Markdown CSS', () => {
	it('publishes the pinned geometry and exact dark palette', () => {
		expect(declarations('.claude-sessions-timeline-container')).toMatchObject({
			'--cs-md-font-family': "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
			'--cs-md-font-size': '12px',
			'--cs-md-line-height': '18px',
		});
		expect(declarations('.theme-dark .claude-sessions-timeline-container')).toEqual({
			'--cs-md-text': '#d4d4d4',
			'--cs-md-heading': '#f0c674',
			'--cs-md-link': '#81a2be',
			'--cs-md-inline-code': '#8abeb7',
			'--cs-md-quote-text': '#808080',
			'--cs-md-quote-border': '#808080',
			'--cs-md-rule': '#808080',
			'--cs-md-list-marker': '#8abeb7',
			'--cs-md-table-border': '#808080',
			'--cs-md-syntax-comment': '#6A9955',
			'--cs-md-syntax-keyword': '#569CD6',
			'--cs-md-syntax-function': '#DCDCAA',
			'--cs-md-syntax-variable': '#9CDCFE',
			'--cs-md-syntax-string': '#CE9178',
			'--cs-md-syntax-number': '#B5CEA8',
			'--cs-md-syntax-type': '#4EC9B0',
			'--cs-md-syntax-operator': '#D4D4D4',
			'--cs-md-syntax-punctuation': '#D4D4D4',
		});
	});

	it('publishes the exact light palette', () => {
		expect(declarations('.theme-light .claude-sessions-timeline-container')).toEqual({
			'--cs-md-text': '#1f2328',
			'--cs-md-heading': '#9a7326',
			'--cs-md-link': '#547da7',
			'--cs-md-inline-code': '#5a8080',
			'--cs-md-quote-text': '#6c6c6c',
			'--cs-md-quote-border': '#6c6c6c',
			'--cs-md-rule': '#6c6c6c',
			'--cs-md-list-marker': '#588458',
			'--cs-md-table-border': '#6c6c6c',
			'--cs-md-syntax-comment': '#008000',
			'--cs-md-syntax-keyword': '#0000FF',
			'--cs-md-syntax-function': '#795E26',
			'--cs-md-syntax-variable': '#001080',
			'--cs-md-syntax-string': '#A31515',
			'--cs-md-syntax-number': '#098658',
			'--cs-md-syntax-type': '#267F99',
			'--cs-md-syntax-operator': '#000000',
			'--cs-md-syntax-punctuation': '#000000',
		});
	});

	it('scopes every adapted selector through the session Markdown hook', () => {
		const section = piMarkdownSection().replace(/\/\*[\s\S]*?\*\//g, '');
		const selectorGroups = [...section.matchAll(/([^{}]+)\{[^{}]*\}/g)]
			.map(match => match[1]);
		const selectors = selectorGroups.flatMap(group => group.split(',').map(value => value.trim()));

		expect(selectors.length).toBeGreaterThan(40);
		for (const selector of selectors) {
			expect(selector).toContain('.claude-sessions-timeline-container');
			expect(selector).toContain('.claude-sessions-markdown-content');
		}
		expect(section).not.toMatch(/claude-sessions-(?:summary|dash-|system-events|turn-header|tool-header|controls)/);
		expect(section).not.toContain('!important');
	});

	it('covers Pi element geometry, neutral fills, and every Prism semantic category', () => {
		const section = piMarkdownSection();
		for (const selector of [' h1', ' p + p', ' a', ' code', ' pre', ' blockquote', ' ul', ' ol', ' li::marker', ' hr', ' table', ' th', ' td', ' img']) {
			expect(section).toContain(`.claude-sessions-markdown-content${selector}`);
		}
		expect(section).toContain('background: rgba(128, 128, 128, 0.2);');
		expect(section).toContain('background: rgba(128, 128, 128, 0.1);');
		const cellRule = /\.claude-sessions-markdown-content th,[\s\S]*?\.claude-sessions-markdown-content td \{([^}]*)\}/.exec(section)?.[1];
		expect(cellRule).toContain('font-size: inherit;');
		expect(cellRule).toContain('line-height: inherit;');
		expect(cellRule).toContain('color: inherit;');
		expect(cellRule).toContain('white-space: normal;');

		const tokenMap: Record<string, string> = {
			comment: '--cs-md-syntax-comment',
			keyword: '--cs-md-syntax-keyword',
			number: '--cs-md-syntax-number',
			string: '--cs-md-syntax-string',
			function: '--cs-md-syntax-function',
			'class-name': '--cs-md-syntax-type',
			variable: '--cs-md-syntax-variable',
			operator: '--cs-md-syntax-operator',
			punctuation: '--cs-md-syntax-punctuation',
		};
		for (const [token, property] of Object.entries(tokenMap)) {
			const tokenRule = new RegExp(`[^{}]*\\.token\\.${token.replace('-', '\\-')}[^{}]*\\{([^}]*)\\}`).exec(section);
			expect(tokenRule?.[1]).toContain(`var(${property})`);
		}
	});

	it('uses Obsidian theme classes only and keeps Pi page surfaces out of the adaptation', () => {
		expect(css).not.toContain('prefers-color-scheme');
		const section = piMarkdownSection();
		for (const excluded of ['#18181e', '#1e1e24', '#f8f8f8', 'userMsgBg', 'toolSuccessBg', 'customMsgBg']) {
			expect(section).not.toContain(excluded);
		}
	});
});

describe('session Markdown theming documentation', () => {
	it('documents every published property, the shared hook, mode selection, and attribution', () => {
		const theming = fs.readFileSync(path.join(ROOT, 'THEMING.md'), 'utf8');
		const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
		const allProperties = new Set([...css.matchAll(/(--cs-[\w-]+)\s*:/g)].map(match => match[1]));
		const properties = new Set([...css.matchAll(/(--cs-md-[\w-]+)\s*:/g)].map(match => match[1]));
		expect(allProperties.size).toBe(66);
		expect(readme).toContain('- 66 CSS custom properties (`--cs-*`)');
		expect(properties.size).toBe(21);
		for (const property of properties) expect(theming).toContain(`\`${property}\``);
		expect(theming).toContain('Claude Code and pi transcripts');
		expect(theming).toContain('.claude-sessions-markdown-content');
		expect(theming).toContain("Obsidian's active `.theme-light` or `.theme-dark`");
		expect(theming).toContain('non-Markdown UI');
		expect(theming).toContain('5cd93f688aaab89dbb6dfa4aca535f21796ae185');
		expect(theming).toContain('MIT License');
	});
});

describe('session Markdown renderer coverage', () => {
	it('routes all 22 production render sites through the format-independent helper', () => {
		const timeline = fs.readFileSync(path.join(ROOT, 'src/views/timeline-renderer.ts'), 'utf8');
		const tools = fs.readFileSync(path.join(ROOT, 'src/views/tool-renderer.ts'), 'utf8');
		const viewFiles = fs.readdirSync(path.join(ROOT, 'src/views')).filter(name => name.endsWith('.ts'));
		const directCallFiles = viewFiles.filter(name => {
			const source = fs.readFileSync(path.join(ROOT, 'src/views', name), 'utf8');
			return source.includes('MarkdownRenderer.render(');
		});

		expect(directCallFiles).toEqual(['render-helpers.ts']);
		expect(timeline.match(/renderSessionMarkdown\(/g)).toHaveLength(8);
		expect(tools.match(/renderSessionMarkdown\(/g)).toHaveLength(14);
		expect(timeline + tools).not.toMatch(/metadata\.format|format\s*[!=]==?\s*['"](?:claude|pi)['"]/);
	});
});

describe('standalone export theming', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('captures the scoped rules, both palettes, and mode-specific snippet overrides', () => {
		class FakeStyleRule {
			style: { length: number; getPropertyValue: (name: string) => string; [index: number]: string };
			constructor(readonly cssText: string, properties: string[] = []) {
				this.style = {
					length: properties.length,
					getPropertyValue: (_name: string) => '',
				};
				properties.forEach((property, index) => { this.style[index] = property; });
			}
		}
		class FakeFontFaceRule {}

		const rules = [
			new FakeStyleRule(
				'.claude-sessions-timeline-container { --cs-md-font-size: 12px; --cs-md-heading: #123456; }',
				['--cs-md-font-size', '--cs-md-heading'],
			),
			new FakeStyleRule(`.theme-dark .claude-sessions-timeline-container {${ruleBody('.theme-dark .claude-sessions-timeline-container')}}`),
			new FakeStyleRule(`.theme-light .claude-sessions-timeline-container {${ruleBody('.theme-light .claude-sessions-timeline-container')}}`),
			new FakeStyleRule(`.claude-sessions-timeline-container .claude-sessions-markdown-content {${ruleBody('.claude-sessions-timeline-container .claude-sessions-markdown-content')}}`),
		];
		const activeDocumentStub = {
			documentElement: {},
			body: {},
			styleSheets: [{ ownerNode: { nodeName: 'STYLE' }, href: null, cssRules: rules }],
			querySelector: (_selector: string) => ({}),
		};
		vi.stubGlobal('CSSStyleRule', FakeStyleRule);
		vi.stubGlobal('CSSFontFaceRule', FakeFontFaceRule);
		vi.stubGlobal('activeDocument', activeDocumentStub);
		vi.stubGlobal('getComputedStyle', () => ({
			getPropertyValue: (name: string) => name === '--cs-md-heading' ? '#123456' : '',
		}));

		const captured = captureAllCSS();
		expect(captured).toContain('.claude-sessions-markdown-content');
		expect(captured).toContain('.theme-dark .claude-sessions-timeline-container');
		expect(captured).toContain('.theme-light .claude-sessions-timeline-container');
		expect(captured).toContain('--cs-md-syntax-comment: #6A9955');
		expect(captured).toContain('--cs-md-syntax-comment: #008000');
		expect(captured).toContain('.theme-light .claude-sessions-timeline-container,\n.theme-dark .claude-sessions-timeline-container {\n  --cs-md-heading: #123456;');
	});

	it('keeps the marker in snapshots and applies the active class to html and body', () => {
		const exporter = fs.readFileSync(path.join(ROOT, 'src/exporters/html-exporter.ts'), 'utf8');
		expect(exporter).toContain('const clone = timelineEl.cloneNode(true) as HTMLElement;');
		expect(exporter).not.toMatch(/(?:removeClass|classList\.remove)\(['"]claude-sessions-markdown-content/);
		expect(exporter).toContain('<html lang="en" class="${themeClass}">');
		expect(exporter).toContain('<body class="${themeClass}">');
	});
});
