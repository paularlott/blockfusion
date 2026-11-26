# Accessibility

BlockFusion targets **WCAG 2.2 AA**.

## Toolbar

- It uses `role=toolbar` with a roving tabindex. Tab enters and leaves it as one stop; Arrow keys, Home and End move within it.
- **Alt+F10** jumps to it from the canvas, and **Escape** goes back.
- Every button has an `aria-label` and a tooltip, shown on hover and keyboard focus and dismissed with Escape.
- Formatting buttons expose `aria-pressed`. Menus use `menuitemradio` with `aria-checked`. Undo and redo are labelled with the step they would take, for example "Undo Insert row".

## Structure from the keyboard

Every row and column has a focusable handle button in the canvas, placed before its content in the tab order. Its menu holds every action:

- move up, down, left or right;
- wider and narrower;
- add, duplicate or delete;
- settings;
- insert a row above or below;
- edit code.

Some actions have shortcuts on the handle:

- **Alt+↑ / Alt+↓** move a row.
- **Alt+← / Alt+→** move a column.
- **Alt+Shift+← / Alt+Shift+→** resize a column.
- **Delete** deletes.

**Escape** in a column's text moves focus to that column's handle. After each structural change, focus stays on the moved or new item.

## Announcements

A polite live region reports what happened, for example:

- "Row moved up, now row 2 of 4"
- "Column is 8 of 12 wide"
- "Undone: Typing"
- "Insert block Hero: row 3 of 5"

## Dialogs

Dialogs are modal `<dialog>` elements that:

- are labelled by their title and described by their help text;
- keep focus inside;
- close with Escape;
- return focus to where it was, including inside the canvas.

Invalid fields are marked with `aria-invalid` and `aria-errormessage`.

## Visual

- **Focus and targets.** Focus is always visible. Every control is at least 24×24px; toolbar buttons are 32px.
- **Themes.** Light and dark follow `prefers-color-scheme`. The host can override this with `theme` or a `data-theme` attribute on an ancestor.
- **Contrast.** `test/contrast.test.ts` checks every colour token pairing numerically for AA, in both themes.
- **Forced colours.** Pressed, focus and disabled states use system colours.
- **Reduced motion.** Transitions are turned off.

## Contrast checker

The "Contrast checker" toolbar button lists problems, each with a "Go to" button:

- text below WCAG AA contrast (4.5:1, or 3:1 for large text), measured on the rendered canvas so theme CSS and row and column backgrounds count; text over a gradient is measured against its worst colour stop, and text over a background image is flagged to check by eye. When the site has a dark mode the editor can preview, contrast is checked in both modes, and "Go to" switches the preview to the mode the problem shows in;
- images without alt text (or with placeholder alt text);
- skipped or empty heading levels;
- links without text.

It is a quick check, not a full accessibility audit. The image dialog asks for alt text unless the image is marked decorative.

## Keyboard shortcuts

**Keyboard help** (Mod+/) lists them all:

| Action | Keys |
| --- | --- |
| Undo / redo | Mod+Z / Mod+Shift+Z, Ctrl+Y |
| Bold, italic, underline | Mod+B, Mod+I, Mod+U |
| Strikethrough, subscript, superscript | Mod+Shift+X, Mod+,, Mod+. |
| Paragraph, Heading 1–6 | Mod+Alt+0, Mod+Alt+1…6 |
| Bulleted / numbered list | Mod+Shift+8 / Mod+Shift+7 |
| Quote | Mod+Shift+9 |
| Indent / outdent | Mod+] / Mod+[ |
| Align left / centre / right / justify | Mod+Shift+L / E / R / J |
| Link | Mod+K |
| Clear formatting | Mod+\ |
| Block menu, add row, HTML source | Mod+; then B, R, H |
| Read aloud, dictate, assistant chat | Mod+; then S, D, A |
| Block menu (on an empty line; / then Escape types a slash) | / |

**Mod** is ⌘ on macOS and Ctrl elsewhere. **Mod+; then a letter** is a two-step shortcut: press ⌘; (Ctrl+;), let go, then the letter. The editor shows which letters are on offer, and Escape cancels. These replace ⌘⌥ combinations that browsers keep for themselves on macOS. Change the first key with the `chordKey` option (or turn them off with `false`); plugins give a command a letter with `chord`.
