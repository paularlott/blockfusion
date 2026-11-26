# Getting started

Include the built files. They are committed in `dist/`, so you don't need Node to use them.

```html
<link rel="stylesheet" href="dist/blockfusion.css">
<script src="dist/blockfusion.js"></script>

<form method="post">
	<textarea name="content"><div class="row"><div class="span-s12"><p>Hello</p></div></div></textarea>
	<button>Save</button>
</form>

<script>
	const editor = BlockFusion.create(document.querySelector('textarea[name=content]'), {
		converter: 'fusioncss',
		stylesheets: ['/theme/fusioncss.css', '/theme/site.css'],
		bodyClass: 'page-content',
	});
</script>
```

You can also use it as an ES module:

```js
import { create } from './dist/blockfusion.mjs';
const editor = create('#page', { converter: 'bootstrap5', stylesheets: ['/css/bootstrap.min.css'] });
```

## Textarea mode

When created on a `<textarea>`, BlockFusion:

- hides the textarea;
- loads its value as the content;
- keeps the value up to date after each change, and again on `submit` and `formdata`.

Normal form posts therefore just work. On any other element, its current HTML becomes the content.

## What you get

- **WYSIWYG canvas.** It's a same-origin iframe that loads your `stylesheets` and `bodyClass`, so the content looks exactly as it does on the site. The toolbar, panels and dialogs sit outside it, styled by `blockfusion.css` and prefixed `bf-`.
- **Rows and columns.**
  - Add a row with a layout picker: 1, 1/2+1/2, 1/3×3, 1/4×4, 2/3+1/3, 1/3+2/3, 3/4+1/4, 1/4+3/4, or a wide centre with narrow sides (1/4+1/2+1/4). Columns can be added, removed and resized afterwards, and exact spans set in column settings.
  - Add, remove, move, resize, duplicate and delete rows and columns.
  - Clicking anywhere in a column, including the space below its text, puts the cursor at the end of its text. An empty column is outlined and shows a "Type here…" prompt.
  - Row and column settings: class, id, element, background, inline style, custom attributes, and spans per breakpoint.
- **Blocks.** A block menu with search and categories, in a popover under the toolbar (or `/` on an empty line). A block is one or more rows, given as neutral rows or as HTML for any known framework. Inserting a block converts it to the active framework.
- **Rich text.**
  - Paragraph, H1–H6 and preformatted.
  - Font family and size.
  - Bold, italic, underline, strikethrough, subscript and superscript.
  - Quote, indent and outdent, bulleted and numbered lists, alignment.
  - Links, images and text colour.
  - Clear formatting, and an HTML source view.
  - Paste cleaning that strips Word and Google Docs markup.
- **Raw HTML/JavaScript** rows and columns.
  - **Add HTML** puts the code in a row and column, so it follows the page grid like any other row and can take more columns. Ticking **Custom row, without row and column markup** writes only the code.
  - The row menu switches between the two: **Make custom HTML row** on a row whose only column is code, **Wrap in row and column** on a custom row. When the row or column has its own class, id, style or attributes, they go into the custom row's code so the page doesn't change.
  - **Convert to HTML code** (column menu) turns a text column into a code column, keeping its place and width. To add a code column, add a column and convert it.
  - Saving empty code removes the code row or column.
  - They're written to the output verbatim.
  - In the canvas they show as a labelled placeholder with a sandboxed preview, so scripts never run in the editor.
- **Undo and redo** for structure and text. Typing in a column merges into one step.
