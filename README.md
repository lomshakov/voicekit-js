# VoiceKit — TypeScript SDK

[![npm version](https://img.shields.io/npm/v/voicekit-client)](https://www.npmjs.com/package/voicekit-client)
[![Node.js](https://img.shields.io/badge/node-18%2B-blue)](https://www.npmjs.com/package/voicekit-client)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Official TypeScript/JavaScript wrapper for **[VoiceKit](https://ttsapi.ru)** — the REST API for Russian speech:
neural speech synthesis (TTS), transcription (STT) with diarization and timestamps,
sentiment analysis, voice cloning, voice biometrics, audio effects and batch operations.

> **Links:** [Website](https://ttsapi.ru) · [Documentation](https://ttsapi.ru/docs) · [API reference](https://ttsapi.ru/swagger) · [Pricing](https://ttsapi.ru/pricing) · [Blog](https://ttsapi.ru/blog)

Requires Node.js 18+ (global `fetch`). WebSocket streaming uses the `ws` package.

## Install

```bash
npm install voicekit-client
```

## Quick start

```js
import { VoiceKitClient, b64 } from "voicekit-client";
import { writeFile } from "node:fs/promises";

const client = new VoiceKitClient({ apiKey: "YOUR_KEY" });

// Synthesis → raw audio bytes
const audio = await client.synthesize("Привет! Это синтез русской речи.", {
  voice: "preset_anna",
  format: "mp3",
});
await writeFile("speech.mp3", audio);

// Streaming (Pro/Business)
for await (const chunk of client.synthesizeStream("Первое предложение. Второе.")) {
  // write chunks to a file or socket
}

// Transcription (async → poll)
const job = await client.transcribe("audio.wav", { keyterms: ["диагноз"] });
let result = await client.getTranscriptionJob(job.job_id);
while (!["completed", "failed"].includes(result.status)) {
  await new Promise(r => setTimeout(r, 1000));
  result = await client.getTranscriptionJob(job.job_id);
}

// Short-file sync transcription
const transcript = await client.transcribeSync("audio.wav");

// Analysis (sentiment + keywords + entities)
const analysis = await client.analyzeSync("audio.wav");

// Text intelligence
const moderation = await client.moderate("Это оскорбительное сообщение.");

// Batches
const batch = await client.batchSynthesize([
  { text: "Первый текст", voice: "preset_anna" },
  { text: "Второй текст", voice: "dmitri" },
]);
const status = await client.getBatch(batch.batch_id);

const analysisBatch = await client.batchAnalyze([
  { audio: await b64("a.wav"), language: "ru" },
  { audio: await b64("b.wav"), language: "ru" },
]);

// Voice cloning (Pro/Business)
const clone = await client.createCloneVoice({
  name: "My voice",
  promptText: "Точный текст образца.",
  samples: "reference.wav",
});
console.log(await client.listCloneVoices());
await client.deleteCloneVoice(clone.id);

// VAD (speech segments)
const segments = await client.vad("audio.wav");

// Account
const usage = await client.usage();
const balance = await client.billingBalance();
```

### Audio effects (Pro/Business)

```js
// Inline during synthesis — the chain is applied to the synthesized audio
const fxAudio = await client.synthesize("Привет!", {
  effects: '[{"type":"reverb","room_size":0.5},{"type":"pitch","semitones":2}]',
});

// Async processing of an existing file
const fxJob = await client.applyAudioEffects("voice.mp3", [{ type: "compressor", ratio: 3 }]);
let fxResult = await client.getAudioEffectsJob(fxJob.job_id);
while (!["completed", "failed"].includes(fxResult.status)) {
  await new Promise(r => setTimeout(r, 1000));
  fxResult = await client.getAudioEffectsJob(fxJob.job_id);
}
const fxFile = await client.downloadAudioEffects(fxJob.job_id);
await writeFile("voice_fx.mp3", fxFile);
```

### Audio cleaning (Pro/Business)

```js
// Denoise + normalize an existing file as a background job
const cleanJob = await client.cleanAudio("noisy.wav");     // one-click preset
// or with options:
// const cleanJob = await client.cleanAudio("noisy.wav", { options: { denoise: { strength: 0.8 } } });

let cleanResult = await client.getAudioCleaningJob(cleanJob.job_id);
while (!["completed", "failed"].includes(cleanResult.status)) {
  await new Promise(r => setTimeout(r, 1000));
  cleanResult = await client.getAudioCleaningJob(cleanJob.job_id);
}
const cleanFile = await client.downloadAudioCleaning(cleanJob.job_id);
await writeFile("voice_clean.wav", cleanFile);
```

### WebSocket streaming (Pro/Business)

```js
const stream = await client.transcribeStream({ language: "ru", keyterms: ["диагноз"] });
await stream.sendAudio(pcm16Chunk1); // raw PCM16, 16 kHz mono (Uint8Array)
await stream.sendAudio(pcm16Chunk2);
await stream.stop();                 // finalize the utterance
for await (const event of stream.events()) {
  console.log(event.type, event);    // session / vad / partial / final / error
}
stream.close();

const vad = await client.vadStream(); // VAD events only (speech_started/ended)
await vad.sendAudio(pcm16Chunk);
await vad.stop();
for await (const event of vad.events()) {
  console.log(event.type, event);
}
vad.close();
```

### Voice ID (Pro/Business)

```js
// Voice passport: language, gender, age, emotion, speaker embedding, AI-vs-human
const passport = await client.voiceId("recording.wav");

// Voice biometrics on your own profiles
const profile = await client.enrollVoice("speaker.wav", "Alice");  // { profile_id: "voice_…" }

const check = await client.verifyVoice("check.wav", profile.profile_id);
// { profile_id: "voice_…", similarity: 0.81, verified: true, threshold: 0.7 }

const match = await client.identifyVoice("check.wav");            // 1:N across your profiles
// { best_match: {…}, matches: […], threshold: 0.7 }

const profiles = await client.listVoiceProfiles();
await client.deleteVoiceProfile(profile.profile_id);
```

## Examples

Runnable scripts live in [`examples/`](./examples): synthesis, streaming, transcription,
analysis and voice cloning. Each script reads the `VOICEKIT_API_KEY` environment variable.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` | — | API key (required) |
| `baseUrl` | `https://ttsapi.ru` | API base URL (e.g. `http://localhost:5080` for local dev) |
| `timeoutMs` | `120000` | Per-request timeout in milliseconds |

Errors reject with `VoiceKitError` (`.status`, `.code`, `.message`).

## Documentation

Full API reference and guides: **[ttsapi.ru/docs](https://ttsapi.ru/docs)**.

## License

[MIT](./LICENSE)
