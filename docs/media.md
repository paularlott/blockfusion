# Media provider

```ts
interface MediaProvider {
	pickImage?(opts: { current?: { src: string; alt?: string } }): Promise<{ src; alt?; width?; height? } | null>;
	pickFile?(opts: { current?: string }): Promise<{ href; title? } | null>;
	pickImageLabel?: string; // default "Browse images…"
	pickFileLabel?: string; // default "Browse files…"
	upload?(file: File): Promise<{ src: string; alt?: string }>;
}
```

- **`pickImage`** opens first for a new image; the image dialog then opens with the picked image filled in, for its alt text (or to mark it decorative) and width. It also adds a "Browse images…" button to the dialog.
- **`pickFile`** adds "Browse files…" to the link dialog.
- **`pickImageLabel`** and **`pickFileLabel`** rename those buttons to suit your pickers (for example "Choose a page…").
- **`upload`**:
  - lets you drop or paste image files into a column, uploading them and inserting them at the caret;
  - adds an upload field to the image dialog.
- **No provider.** The editor asks for a URL and alt text in an accessible dialog. A dropped or pasted image without `upload` opens that dialog instead.

Change the provider at any time with `editor.setMediaProvider(provider)`.
