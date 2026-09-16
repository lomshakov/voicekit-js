import { VoiceKitClient } from "voicekit-client";
import { writeFile } from "node:fs/promises";

const client = new VoiceKitClient({ apiKey: process.env.VOICEKIT_API_KEY });

const audio = await client.synthesize("Привет! Это синтез русской речи через VoiceKit.", {
  voice: "preset_anna",
  format: "mp3",
});

await writeFile("speech.mp3", audio);
console.log(`saved speech.mp3 (${audio.length} bytes)`);
