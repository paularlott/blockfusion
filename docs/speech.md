# Dictation and read aloud

## Dictation

Dictation is off by default; turn it on with `dictation: true` (the browser's speech recognition) or a provider of your own (below). The **Dictate** button (microphone, Mod+; then D) then turns speech into text in the column being edited. Put the cursor in a text column, or select text to replace, and press it. Words appear in grey as they are heard and settle into the text; press Dictate again, or Escape, to stop. Spoken commands are listed below, and in the editor's keyboard help (Mod+/). Dictated text is ordinary typing: it can be undone, and the grey words never reach the saved content.

### Spoken commands

| Say | Does |
| --- | --- |
| "new line" | A line break within the paragraph. |
| "new paragraph" | Starts a new paragraph. |
| "delete last", or "scratch that" | Removes the last thing dictated: a phrase (Chrome, Safari), a sentence (Edge, which sends several at once) or a line or paragraph break. Say it again to keep going back. Text edited since it was dictated is left alone. |

- Commands are English, and they're acted on wherever the words come up, with no pause needed: "a new line of products" becomes "a", a line break, then "of products". To get those words into the text, type them.
- A full stop a punctuating service adds after a command ("New line.") is dropped.
- Punctuation is otherwise up to the browser: Edge adds it, Chrome and Safari mostly don't.
- Stop with the Dictate button or Escape. Everything dictated in one go is one undo step.

### Speech recognition

By default it uses the browser's speech recognition (the Web Speech API):

- Chrome and Edge send the audio to their speech service (Google, Microsoft); Safari uses Apple's. Firefox doesn't support it, so the button isn't shown there. Support varies by platform (Edge on macOS has been unreliable); when recognition fails or stops at once, a message under the toolbar says so.
- The page must be served over HTTPS, or from `localhost` while developing (`http://` on an IP address or other host name doesn't count), and the browser asks for microphone access the first time.
- Chrome needs to reach Google's speech service. Chromium browsers without one (Brave, and Edge on macOS) fail with a network error; Chrome and Safari work.

A host can supply its own speech to text (a self-hosted model, say) as the `dictation` option:

```js
BlockFusion.create(el, {
	dictation: {
		name: 'our speech service',
		start({ onInterim, onFinal, onError, onEnd }, { lang }) {
			// stream audio to the service; call onInterim(text) as words come in,
			// onFinal(text) when they settle, onError(message), onEnd()
			return { stop() { /* stop listening */ } };
		},
	},
});
```

`BlockFusion.webSpeechDictation()` returns the built-in provider, or null where the browser has none.

## Read aloud

The **Read aloud** button (speaker, Mod+; then S) has the browser speak the selected text, or the whole column the cursor is in, highlighting each word as it's spoken (where the browser supports the CSS Custom Highlight API). Press it again, or Escape, to stop. Headings and paragraphs get a pause between them, and images are read by their alt text.

It's off by default:

```js
BlockFusion.create(el, { readAloud: true });
BlockFusion.create(el, { readAloud: { voice: 'Karen', rate: 1.1 } }); // a voice name from speechSynthesis.getVoices()
```

It uses the browser's own speech (`speechSynthesis`), so nothing is downloaded. The voice follows the content's language; most system voices speak on the device, though some browsers also offer online voices.
