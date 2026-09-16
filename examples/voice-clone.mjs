import { VoiceKitClient } from "voicekit-client";

const client = new VoiceKitClient({ apiKey: process.env.VOICEKIT_API_KEY });

const clone = await client.createCloneVoice({
  name: "My voice",
  promptText: "Точный текст образца.",
  samples: "reference.wav",
});
console.log("clone:", clone.id);

const voices = await client.listCloneVoices();
console.log("voices:", voices.map((v) => v.id));

const passport = await client.voiceId("recording.wav");
console.log("voice passport:", passport);

await client.deleteCloneVoice(clone.id);
console.log("deleted", clone.id);
