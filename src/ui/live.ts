/**
 * Live region for screen reader announcements ("Row moved up", "Undone:
 * Typing"). The text is cleared and re-set so repeats are announced too.
 */
export class Announcer {
	readonly el: HTMLElement;
	private timer = 0;

	constructor(host: HTMLElement) {
		this.el = document.createElement('div');
		this.el.className = 'bf-sr-only';
		this.el.setAttribute('role', 'status');
		this.el.setAttribute('aria-live', 'polite');
		this.el.setAttribute('aria-atomic', 'true');
		host.appendChild(this.el);
	}

	say(message: string): void {
		clearTimeout(this.timer);
		this.el.textContent = '';
		this.timer = window.setTimeout(() => {
			this.el.textContent = message;
		}, 50);
	}

	destroy(): void {
		clearTimeout(this.timer);
		this.el.remove();
	}
}
