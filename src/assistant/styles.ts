/**
 * The assistant's styles, added to the page when the assistant is installed,
 * so blockfusion.css carries nothing for pages without AI. They use the
 * editor's --bf-* tokens, so light and dark follow the editor.
 */
const CSS = `
/* Assistant suggestion */
.bf-assistant-output {
	min-height: 6em;
	max-height: 40vh;
	resize: vertical;
	line-height: 1.5;
}
.bf-assistant-output[readonly] {
	background: var(--bf-surface-2);
}
.bf-assistant-original summary {
	cursor: pointer;
	color: var(--bf-fg-muted);
}
.bf-assistant-original p {
	margin: 6px 0 0;
	white-space: pre-wrap;
	color: var(--bf-fg-muted);
}

/* Assistant chat */
.bf-btn-sm {
	min-height: 28px;
	padding: 2px 8px;
	font-size: 13px;
}
.bf-chat-log {
	display: grid;
	align-content: start;
	gap: 8px;
	min-height: 120px;
	max-height: 45vh;
	overflow: auto;
	padding: 2px;
}
.bf-chat-msg {
	max-width: 92%;
	padding: 6px 10px;
	border-radius: 10px;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.bf-chat-user {
	justify-self: end;
	background: var(--bf-primary-soft);
	color: var(--bf-fg);
}
.bf-chat-assistant {
	justify-self: start;
	background: var(--bf-surface-2);
	color: var(--bf-fg);
}
.bf-chat-note {
	justify-self: start;
	padding: 0 2px;
	color: var(--bf-fg-muted);
	font-size: 13px;
}
/* The chat popover: the conversation takes the room, the form stays in view */
.bf-chatpop {
	width: min(640px, calc(100vw - 16px));
}
.bf-chatpop .bf-chat-log {
	flex: 1 1 auto;
	max-height: none;
	min-height: 160px;
}
.bf-chat-form {
	display: grid;
	gap: 6px;
}
.bf-chat-buttons {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.bf-chat-actions {
	display: flex;
	gap: 8px;
	margin-inline-start: auto;
}
.bf-chat-input {
	resize: vertical;
}
`;

export function addAssistantStyles(): void {
	if (typeof document === 'undefined' || document.getElementById('bf-assistant-css')) return;
	const style = document.createElement('style');
	style.id = 'bf-assistant-css';
	style.textContent = CSS;
	document.head.append(style);
}
