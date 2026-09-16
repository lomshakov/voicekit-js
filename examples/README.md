# TypeScript / JavaScript examples

Each script requires a `VOICEKIT_API_KEY` environment variable.

```bash
npm install voicekit-client
export VOICEKIT_API_KEY="rtt_…"          # PowerShell: $env:VOICEKIT_API_KEY = "rtt_…"
node synthesize.mjs
```

| Script | What it does |
| --- | --- |
| `synthesize.mjs` | One-shot synthesis → `speech.mp3` |
| `synthesize-stream.mjs` | Streaming synthesis (Pro/Business) → `speech_stream.mp3` |
| `transcribe.mjs` | Async transcription + diarization (speaker labels) |
| `analyze.mjs` | Sync transcription, sentiment analysis, moderation |
| `voice-clone.mjs` | Voice cloning + voice ID (Pro/Business) |
