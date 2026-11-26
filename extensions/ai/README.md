# blockfusion-ai

An optional BlockFusion assistant that runs small open models **in the browser**, with [transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0):

| Job | Model | Licence | Download (first use, then cached) |
| --- | --- | --- | --- |
| Describe an image (alt text) | [Florence-2-base](https://huggingface.co/onnx-community/Florence-2-base-ft) | MIT | about 360 MB with WebGPU, 275 MB without |
| One-shot text actions (improve, fix, …) and the chat that changes the page | [Qwen3-0.6B](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX) | Apache-2.0 | about 570 MB with WebGPU (one download for both) |

For a model on your server instead, use the editor's `completionsAssistant` (in the assistant bundle; see the editor's README).

Nothing leaves the device. Nothing loads until a feature is first used: the editor side is 4 KB, transformers.js (570 KB) and the ONNX Runtime WebAssembly build the browser needs follow on first use, then the model.

## Build

```sh
npm install
npm run build    # dist/blockfusion-ai.mjs, dist/chunks/, dist/ort/
```

`dist/ort/` holds the ONNX Runtime WebAssembly build that transformers.js uses (for WebGPU and the CPU alike), served from beside the module so nothing comes from a CDN.

## Use

```html
<script src="blockfusion.js"></script>
<!-- The assistant's UI: registers itself with the editor -->
<script src="blockfusion-assistant.js"></script>
<script type="module">
	import { localAssistant } from './blockfusion-ai/blockfusion-ai.mjs';
	BlockFusion.create(el, { assistant: localAssistant(), assistantChat: true });
</script>
```

Without `blockfusion-assistant.js` (or `assistantPlugin` from its module), the `assistant` option does nothing.

To serve the models from your own server, set `modelHost` to a copy laid out as `${modelHost}${model}/resolve/main/…` (as on Hugging Face). A relative address is resolved against the page, and the server should answer ranged GET requests (a plain 200 is fine).

Options:

- `textModel`, `chatModel`, `imageModel`: another Hugging Face model id with ONNX weights (Florence-2 family for images), or `false` to turn that job off. The text and chat jobs share one download when they name the same model, as they do by default. `HuggingFaceTB/SmolLM2-360M-Instruct` (275 MB) is a smaller choice for the text actions alone. The editor shows the chat only with its `assistantChat` option.
- `modelHost`: download models from your own copy (`${modelHost}${model}/resolve/main/…`) rather than Hugging Face.
- `device`: `'auto'` (WebGPU when the browser has it), `'webgpu'` or `'wasm'` (CPU; slower).
- `name`: shown with suggestions. Default "a model on this device".

The page must be served over http(s) (module imports and the model cache don't work from `file://`).

## What to expect

These are small models, picked to be quick to download. On a test with WebGPU (after the download): an image description in about 2 seconds, a paragraph rewrite in about 10.

- Florence-2 captions are short and literal (a red circle on blue came back as "A red color object."); English only. Openings like "In this image we can see" are removed.
- Qwen3-0.6B handles the text actions in about a second once loaded. Fixing catches common errors (we has, they is, then/than, tomorow, by/buy) but misses some (to/too, their/they're); how firmly the action's prompt asks makes a big difference.
- Qwen3-0.6B was the best small model for the chat in our tests (4 of 6 requests right, against 1–2 for SmolLM2-1.7B; Qwen3-1.7B doesn't load in a browser). It handles one or two steps ("add a row with 3 columns", "write a welcome in row 2 column 1") but can do more than asked or miss a step. Use a server with a bigger model for dependable multi-step chat.

### Other models we tried

Same prompts, WebGPU, in a browser (six chat requests; six quick actions on three texts):

| Model | Licence | Download | Chat | Quick actions |
| --- | --- | --- | --- | --- |
| **Qwen3-0.6B** (default) | Apache-2.0 | 570 MB | 4 / 6 | Faithful but timid; never invents content |
| SmolLM2-360M-Instruct | Apache-2.0 | 275 MB | not tried | Livelier, but adds commentary ("Here's a rewritten version…") and changes facts |
| SmolLM2-1.7B-Instruct | Apache-2.0 | 1.1 GB | 1–2 / 6 | — |
| Gemma 3 1B instruct (`onnx-community/gemma-3-1b-it-ONNX`) | Gemma Terms of Use | 760 MB | 2 / 6 (makes up its own call format) | The best writer and best at fixing, but sometimes changes meaning ("bred" became "breeding stock") or adds asides |
| Qwen3-1.7B | Apache-2.0 | 1.4 GB | — | Doesn't load in a browser (one file too large) |
| Qwen2.5-1.5B-Instruct | Apache-2.0 | 1.2 GB | — | Gives nonsense with half-precision weights on WebGPU |

Any of these can be set with `textModel` or `chatModel`. Gemma's licence isn't Apache or MIT: an app that uses it takes on Google's Gemma Terms of Use.

Every suggestion is shown for the author to check before it's used. For better results, use a bigger model in the browser, or a model on your server: see `BlockFusionAssistant.completionsAssistant` and `examples/relay.mjs` in the main repository.

## Licence

MIT, Copyright (c) 2026 Paul Arlott. The built files include transformers.js (Apache-2.0) and ONNX Runtime Web (MIT). The models have their own licences (above).
