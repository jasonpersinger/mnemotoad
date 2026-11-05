# Technical research

Research date: 2026-11-05. Sources are official platform documentation, upstream repositories, standards-publisher material, and plugin-author documentation. All technology selections are recommendations. Default-branch files and online policies can change; recheck exact versions, licenses and submission steps before adoption/release. No packages or legacy code were executed.

## Obsidian integration

| Topic | Confirmed platform finding | MNEMOBARD recommendation |
| --- | --- | --- |
| Custom views | ItemView and registered view factories provide host workspace views; onOpen/onClose define view resource lifetime. [Official views guide](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/User%20interface/Views.md). | Separate module views, ordinary leaves, entity ID in restored state; no singleton editor view. |
| Deferred views | Hidden leaves may remain deferred until revealed; inspect instances safely. [Defer views](https://docs.obsidian.md/plugins/guides/defer-views). | Initialize expensive grids only when opened; do not force all restored views active. |
| Lifecycle | Component registration can clean up host/DOM listeners and intervals; other resources need explicit owners. [Lifecycle guide](https://docs.obsidian.md/plugins/guides/lifecycle-management). | Dispose transport, timers, animation frames, observers, async tasks and caches; avoid relying on awaited unload. |
| Vault writes | `Vault.process` supports synchronous conditional text mutation; background read/modify should use it to avoid local races. [Vault guide](https://docs.obsidian.md/Plugins/Vault). | One authoritative file per entity; expected-content check and recovery backup; no multi-file transaction claim. |
| Frontmatter | `FileManager.processFrontMatter` mutates frontmatter atomically and throws on invalid YAML. [API](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Reference/TypeScript%20API/FileManager/processFrontMatter.md). | Patch metadata-only updates preserve unrelated values/prose; whole-file structural changes use the repository codec. |
| Links and media | `getFirstLinkpathDest` resolves a link in source-note context; `Vault.getResourcePath` yields a browser URI. [Link API](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Reference/TypeScript%20API/MetadataCache/getFirstLinkpathDest.md), [resource API](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Reference/TypeScript%20API/Vault/getResourcePath.md). | IDs own entity relationships; native links expose them to users. Resolve media through vault APIs, not machine paths. |
| Settings | Sample `loadData`/`saveData` stores settings through Plugin. [Sample main](https://raw.githubusercontent.com/obsidianmd/obsidian-sample-plugin/master/src/main.ts). | Preferences only; keep musical data in normal files. Validate settings and serialize saves. |
| Theme/UI | Built-in CSS variables support native-looking custom elements. [Styling reference](https://docs.obsidian.md/Reference/CSS%20variables/About%20styling). | Scoped styles; resolved theme colors for Canvas; native controls and accessible DOM alternatives. |
| Platform | Node/Electron APIs are desktop-only; a plugin using them must declare desktop-only. [Requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), [mobile guide](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development). | Desktop-only initial support as requested; avoid runtime Node dependencies so later mobile research stays possible. |

Obsidian does not promise to update arbitrary ID/path strings inside JSON. Metadata is asynchronous and caches are derived; file ID indexing must accommodate startup and rename/delete events. Treat link rewrite behavior, multi-window ownership, media resource codecs, and write failures as host experiments rather than assumptions.

### Official sample inspection and tooling

Read the current sample’s `src/main.ts`, `esbuild.config.mjs`, `package.json`, README, and LICENSE. It uses TypeScript, esbuild, CommonJS delivery, explicit host externals and linting; sample settings and event/interval cleanup are relevant. Its 0BSD license is separate from TROUBADOUR’s unresolved license. Do not reproduce sample demonstration commands or permissive version ranges unchanged. [Official sample](https://github.com/obsidianmd/obsidian-sample-plugin), [build config](https://raw.githubusercontent.com/obsidianmd/obsidian-sample-plugin/master/esbuild.config.mjs), [package](https://raw.githubusercontent.com/obsidianmd/obsidian-sample-plugin/master/package.json), [license](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/LICENSE).

Recommend pnpm for reproducibility with one lockfile and a pinned package-manager version. `pnpm install --frozen-lockfile` enforces lockfile consistency in future CI. This concerns development only; end users need no Node/pnpm installation. [pnpm install reference](https://pnpm.io/cli/install). esbuild does not replace TypeScript checking; run type checking separately. No build/tooling files are created in this milestone.

### Submission and release requirements

The current submission guide requires root README, LICENSE, manifest, visible source repository and a matching GitHub release with `main.js`, `manifest.json`, and optional `styles.css`. The directory workflow links GitHub and Obsidian accounts, reads the manifest from the default branch, and provides automated feedback. Recheck before publishing. [Current submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin).

The sample README still describes submitting a PR to `obsidian-releases`; this differs from the current guide. Prefer the current official submission guide rather than treating old sample instructions as definitive. No account linking, repository creation, or publication was performed.

Select a tested `minAppVersion`, use unique manifest/command IDs, and remove sample behaviors. Developer policies require a license and compliance with third-party attribution and prohibit client-side telemetry and self-installing dependencies. MNEMOBARD’s proposed runtime makes no network calls or external-file access. [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), [developer policies](https://docs.obsidian.md/community-directory/developer-policies). Current fork/permission policy also requires review if adopting code from another community plugin; do not equate permissive licensing with directory approval.

## MIDI evaluation

Standard MIDI files interchange timed performance data, track structure, tempo and meter; they do not reproduce a synthesizer preset’s sound. The MIDI Association’s overview links the full specification, which was not downloaded in this milestone. [SMF overview](https://midi.org/standard-midi-files). The detailed byte contract must be checked against the full specification and independent fixtures during authorized implementation.

| Candidate | Evidence and advantages | Costs / decision |
| --- | --- | --- |
| `midi-file` | Upstream `parseMidi`/`writeMidi`, byte arrays portable outside Node, TypeScript declarations; inspected manifest has no runtime dependencies, declares MIT. [Upstream](https://github.com/carter-thaxton/midi-file), [manifest](https://raw.githubusercontent.com/carter-thaxton/midi-file/master/package.json). | Low-level events require explicit note pairing, timing validation, loss reporting and limits. **Proposed first choice behind adapter**, subject to malformed-input/browser/Type1 fixtures. README examples using `fs` are not a requirement for the byte-array API. |
| `@tonejs/midi` | Typed musical note/track/header model, source ticks and timing utilities; MIT. Inspected manifest depends on `midi-file` and `array-flatten`. [Upstream](https://github.com/Tonejs/Midi), [manifest](https://raw.githubusercontent.com/Tonejs/Midi/master/package.json). | Higher-level conversion may not preserve all unknown events; verify event support rather than promising lossless import. Strong alternative if it meaningfully reduces adapter work. Not an audio synth and does not require using Tone.js transport. |
| MidiWriterJS | Multitrack generation API; MIT shown upstream. [Upstream](https://github.com/grimmdude/MidiWriterJS). | Generation-focused; a separate parser would still be necessary. No advantage established over a single parse/write dependency for MVP. Defer. |
| TROUBADOUR codec | Bounded Type0/1 parser, exact source PPQ, Type0 writer, adversarial tests, documented one-direction REAPER check. [Audit](TROUBADOUR_AUDIT.md#8-midi-findings). | Custom parser maintenance, narrow phrase/schema rules, no Type1 arrangement writer, unclear redistribution rights. **Reference algorithms/tests rather than adopt whole codec.** |

No exact library release is approved or installed. Default-branch version strings are not proof of latest registry versions or maintenance health. Before pinning: inspect published archive, release history, issues, exports, install scripts, transitive license notices and fixture behavior; record bundle size. npm/GitHub popularity is not a correctness argument.

### Timing and interoperability contract

Use integer ticks and explicit PPQ. Legacy evidence favors retaining source PPQ in imported motifs to avoid needless rounding; newly authored motifs default to 960. Compositions use 960 and convert endpoints explicitly at export. [DATA_MODEL.md](DATA_MODEL.md) specifies the rounding/warning policy. Keep quarter-note BPM distinct from meter beats. Later tempo maps require piecewise integration of microseconds/quarter; their editing/import support is deferred, not approximated with one average BPM.

Initial import accepts Types 0/1 PPQ and a selected track/channel with fixed tempo/meter; preserve original bytes. Reject Type2/SMPTE/maps and malformed data. Warn before note-only import when controllers, sustain, bends or other expressive content would be lost. Use note-off-before-note-on ordering, explicit trailing silence and deterministic channels. Arrangement export is a new Type1 conductor-plus-lanes path, shared with preview compilation. Independent-reader and DAW import are release criteria.

### Browser playback and hardware MIDI

Web MIDI concerns device access; it does not parse `.mid` files or synthesize sound. It requires browser support, a secure context and user permission, and may be limited by permission policy. Obsidian desktop permission behavior and OS MIDI availability need empirical checks; mobile support cannot be inferred from Electron. [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API). Hardware input/output is post-MVP.

For audible playback, schedule Web Audio nodes using the audio clock, not animation-frame timestamps. A timer feeds a lookahead window; OS sleep, background suspension and long UI tasks can still interrupt it. [MDN sequencing guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques). Legacy `Transport` provides a valuable starting pattern with cancellation and gain control, but lacks an explicit late-event policy. The new experiment must include a stall longer than the horizon.

Tone.js offers transport, musical scheduling, synths and effects. [Official Tone.js overview](https://tonejs.github.io/). It could reduce future advanced audio work, but the MVP only needs basic audition and a bounded event scheduler. Prefer reviewed Web Audio adapters initially; add Tone.js only after measuring integration/cleanup cost. It does not solve VST hosting or host lifecycle ownership. Web AudioWorklet can later support custom real-time processing but is unnecessary for the proposed oscillator audition scope.

### Piano-roll options

`webaudio-pianoroll` documents mono/poly grid and drag modes, customizable timing, and play-support callbacks without direct sound generation; its upstream license is Apache-2.0. [Upstream](https://github.com/g200kg/webaudio-pianoroll). It is worth a reference evaluation, but no evidence yet establishes MNEMOBARD’s accessibility, theme, large-note and multi-window requirements. Avoid adopting a component solely because its demo looks similar.

TROUBADOUR’s editor has proven useful interaction scenarios but uses all-note DOM updates under a 512-note cap. Its gestures and exact-timing tests are more valuable than copying the 1,050-line mount function. Neither upstream editor nor legacy implementation was dynamically benchmarked here.

## Audio and assets

`AudioContext` provides browser synthesis and scheduling; reuse a shared lazy context rather than one per editor. [AudioContext reference](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext). Create/resume from a playback gesture, catch failure, and stop/release on ownership loss and disable. Avoid proprietary instrument hosting and external audio runtimes.

`decodeAudioData` requires complete file data and yields a resampled AudioBuffer. It is unsuitable as an automatic whole-library decoding strategy. [Decode reference](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData). Decoded float PCM memory is approximately `seconds × sampleRate × channels × 4`; one hour stereo 48 kHz is about 1.29 GiB before extra copies. This is a calculated memory illustration, not a measured host allocation.

For previews, prefer an HTML media element fed a vault resource URI, one active preview, explicit Stop and resource release. Probe formats and handle decode errors; a file extension or `canPlayType` hint is not a codec guarantee across every Obsidian installer. [Media capability API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType). Establish WAV/MP3 fixtures on each desktop OS, then add other codecs only when verified. Asset path and relinking rules are in the data model.

Wavesurfer provides waveform/region/timeline facilities and declares BSD-3-Clause. Its upstream FAQ warns that full decoding may fail on large files and recommends precomputed peaks. [Project](https://wavesurfer.xyz/), [README and large-file guidance](https://github.com/katspaugh/wavesurfer.js). Consider later as a preview component, not the arrangement engine. Bundling it does not supply beat-aligned recording playback or a large-file solution automatically. No server-generated peaks, mandatory external binary, recording engine, or waveform dependency in MVP.

Legacy WAV loading offers good pre-decode size checks and memory budgeting for short comparisons. Preserve those policies if authorized; broaden PATCHBOOK playback independently. File imports never overwrite audio/presets. Do not extract artwork, recorded sounds, or demo assets without provenance review.

## Interface comparison

| Approach | Fit for forms/shell | Fit for dense musical grids | Recommendation |
| --- | --- | --- | --- |
| Vanilla TypeScript/Obsidian DOM | Host controls, minimal bundle; controller discipline needed | DOM per note grows costly; legacy demonstrates the maintenance tradeoff | **Proposed shell choice** with separate domain/controller/render layers. |
| React | Mature component model; explicit root/effect cleanup; added runtime/ecosystem | Still needs culling or imperative canvas, independent from reconciliation | Reasonable if shell complexity justifies it; no demonstrated requirement yet. [Official guide](https://react.dev/learn). |
| Preact | Declarative components with a smaller-runtime design; compatibility requires testing | Same geometry/culling/accessibility work remains | Strong fallback for shell growth; no runtime-size claim measured here. [Official guide](https://preactjs.com/guide/). |
| Svelte | Compiled components, scoped reactive UI; extra compiler/build integration | Imperative dense rendering still needed for high counts | Credible alternative if team expertise benefits; do not use SvelteKit app routing inside Obsidian. [Official overview](https://svelte.dev/docs/svelte/overview). |
| Canvas 2D | Weak semantic forms by itself | Batched/cullable grid drawing; manual hit testing, DPI, focus and accessibility | **Proposed grid choice** with DOM note/clip lists. Validate against actual dense fixtures. |
| SVG | Good sparse diagrams and individually accessible elements | Large node counts still incur DOM/update cost | Icons/sparse overlays; benchmark before dense-note adoption. |

Framework choice does not determine scheduling accuracy or dense-grid performance. Prefer an isolated renderer interface so a later shell framework does not replace domain logic. Canvas caching/layers should follow measured bottlenecks. [MDN canvas optimization guidance](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas).

## Data architecture options

| Option | Strength | Tradeoff / decision |
| --- | --- | --- |
| Markdown + YAML | Native files, properties, notes, links and search | YAML is poor for large ordered note arrays; use identity/catalog metadata only. |
| MIDI as authoritative motif plus sidecar | Immediate musical-tool compatibility, source tick retention | Sidecar metadata/IDs and binary updates need multi-file recovery; original-file overwrite risk | 
| Owned JSON within Markdown | One save boundary, documented structure, user prose, schema visibility | Custom renderer; `.mid` exists after explicit export, not every autosave. **Proposed default**, also supported by legacy experience. |
| Separate JSON arrangement plus Markdown summary | Compact structured authority | Cross-file summary consistency and less native discoverability; defer unless scale requires it. |
| SQLite/IndexedDB/localStorage authority | Efficient indexing | Opaque data, export/recovery/sync complexity, plugin dependence; reject for musical source data. Derived disposable caches only if demonstrated. |

Use UUIDs independent of paths, forward IDs as authoritative relationships, native companion links for navigation, and read-only behavior for unknown schemas. Do not add two authoritative reverse indexes or assume sync supplies transactions. Use explicit migration preview/backup/approval and retained conflict copies. Legacy token/preservation behavior is a candidate for refactoring; its full-scan index and song-owned model are not the recommended architecture.

## Existing Obsidian plugins

The [official community registry](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json) was read directly and confirmed listings for ABC Music Notation, MIDI Logger, Audio Notes, Audio Player, Chronos Timeline, Songwriter Player, and Aurora Tracker. Listing does not establish quality, security, current maintenance or compatibility. Comparisons below use author documentation; plugins were not installed or tested.

| Plugin/reference | Documented overlap | Differentiation or cooperation opportunity |
| --- | --- | --- |
| [MIDI Logger](https://github.com/maybe-hello-world/midi-logger) | Web MIDI captures pitches into editor text/ABC | MNEMOBARD edits timed fragments and exports arrangements. Device capture can remain a separate optional workflow. |
| [MIDI Visualizer](https://github.com/danielrdehaan/MIDI-Visualizer/blob/Main/README.md) | Author describes zoomable canvas piano roll, tempo mapping, audio-linked playhead | Visualization and audio sync are relevant references; editable composition cannot be inferred. This repository was found independently; registry listing was not confirmed. |
| [ABC Music Notation](https://github.com/abcjs-music/obsidian-plugin-abcjs) | ABC code blocks rendered with abcjs | Complementary notation-oriented workflow; do not embed a notation engine in the MVP. |
| [Spartito](https://github.com/riccardosilvestri/obsidian-spartito) | Author describes staff notation/editor and bundled rendering | Compare notation needs later; MNEMOBARD starts with piano-roll fragments and patch relationships. |
| [Audio Notes](https://github.com/jjmaldonis/obsidian-audio-notes) | Time-bounded listening notes/transcripts; documentation includes transcription integrations | Useful annotation conventions, but do not depend on remote transcription or claim all workflows are offline. |
| [Audio Player](https://github.com/noonesimg/obsidian-audio-player) | Registry/author describes background playback, bookmarks and waveform | Avoid duplicating a general media library/player. PATCHBOOK needs contextual previews. |
| [Bases Audio Player](https://github.com/atravel-music/bases-audio-player) | Author describes previews in table/card music properties | Structured patch notes could remain useful in Bases. Its README describes DOM monitoring; do not depend on its internals. Registry listing not confirmed in the targeted scan. |
| [Chronos Timeline](https://github.com/clairefro/obsidian-plugin-chronos) | Interactive linked date/event timelines from Markdown, grouping | Composition timeline uses musical ticks, repeated motifs and export; chronological timeline code is not a MIDI engine. |
| [Songwriter Player](https://github.com/mrrepac/obsidian-songwriter-player) | Official registry describes waveforms, work marker, A/B loop and hotkeys | Relevant production workflow; registry-only feature evidence in this review. No assertion of editable MIDI or patch catalog. |
| [Aurora Tracker](https://github.com/ashotis/Aurora-Tracker) | Author README confirms six synth tracks, editable presets, pattern ordering, text songs and WAV/MIDI export | Closest integrated composition overlap discovered. MNEMOBARD emphasizes reusable standalone motifs, structured patch knowledge and arbitrary lane planning. Author README declares AGPL v3 or later; no code adoption proposed. |
| [Core Canvas/Bases/Audio Recorder](https://obsidian.md/help/plugins) | Linked visual notes, property catalogs, audio capture | Reuse native navigation/files; avoid rebuilding their general purpose. No private Canvas dependency. |

There is no evidence from this bounded survey that the complete proposed workflow is already solved by one plugin, but this is not an exhaustive market-absence claim. Evaluate Aurora Tracker with target users before expanding scope; cooperation/interchange may be more valuable than duplicating its synthesis features.

## Testing and remaining feasibility questions

Vitest supports unit and browser testing; jsdom/happy-dom simulate only portions of browser behavior. Use real browser providers for gestures/layout and the real host for lifecycle, metadata and codecs. [Current Browser Mode guide](https://vitest.dev/guide/browser/). Tests should assert musical/persistence contracts rather than mirror implementation.

Open empirical questions: achievable dense-grid frame budget; scheduler under host stalls; Type1 DAW interoperability; vault conflict/backup behavior under external writes; module disable/reopen cleanup; desktop codec differences; whether source PPQ and live motif references are understandable. Exact experiments are in [RISKS.md](RISKS.md).

Static TROUBADOUR analysis provides promising code and regression knowledge, not fresh benchmark/coverage results. Its historical 134-test report and limited device/REAPER results are labeled in [the audit](TROUBADOUR_AUDIT.md). Approve and perform isolated validation before source adoption. No automatic legacy import is recommended.
