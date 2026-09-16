import { VoiceKitClient } from "voicekit-client";
import { writeFile } from "node:fs/promises";

const client = new VoiceKitClient({ apiKey: process.env.VOICEKIT_API_KEY });

const chunks = [];
for await (const chunk of client.synthesizeStream("Первое предложение. Второе. Третье.")) {
  chunks.push(chunk);
}

await writeFile("speech_stream.mp3", Buffer.concat(chunks));
console.log("saved speech_stream.mp3");
