/** Minimal mock of the obsidian module for parser tests. */

export const Platform = {
	isDesktop: true,
	isDesktopApp: true,
	isMobile: false,
	isMobileApp: false,
	isIosApp: false,
	isAndroidApp: false,
	isMacOS: true,
	isWin: false,
	isLinux: false,
};

export function normalizePath(path: string): string {
	return path;
}

export function setIcon(): void {}

export class MarkdownRenderer {
	static render(
		_app: unknown,
		_markdown: string,
		_destination: HTMLElement,
		_sourcePath: string,
		_component: unknown,
	): Promise<void> {
		return Promise.resolve();
	}
}

export class Notice {
	constructor(_message: string) {}
}
