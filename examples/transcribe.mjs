import { VoiceKitClient } from "voicekit-client";

const client = new VoiceKitClient({ apiKey: process.env.VOICEKIT_API_KEY });

const job = await client.transcribe("meeting.wav", { language: "ru", diarization: true });
let result = await client.getTranscriptionJob(job.job_id);
while (!["completed", "failed"].includes(result.status)) {
  await new Promise((r) => setTimeout(r, 2000));
  result = await client.getTranscriptionJob(job.job_id);
}

console.log(result.transcript);
for (const seg of result.segments ?? []) {
  const speaker = seg.speaker ?? "";
  console.log(`[${seg.start.toFixed(2)}–${seg.end.toFixed(2)}] ${speaker}: ${seg.text}`);
}
