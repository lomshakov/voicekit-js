import { VoiceKitClient } from "voicekit-client";

const client = new VoiceKitClient({ apiKey: process.env.VOICEKIT_API_KEY });

const transcript = await client.transcribeSync("audio.wav");
console.log("transcript:", transcript.transcript);

const analysis = await client.analyzeSync("audio.wav");
console.log("analysis:", analysis);

console.log("moderation:", await client.moderate("Это обычное сообщение."));
