/**
 * Official JavaScript/TypeScript SDK for VoiceKit.
 *
 * Requires Node.js 18+ (global `fetch`, web streams). WebSocket streaming uses the `ws` package.
 *
 * @example
 * import { VoiceKitClient } from "voicekit-client";
 *
 * const client = new VoiceKitClient({ apiKey: "YOUR_KEY" });
 * const audio = await client.synthesize("Привет!", { voice: "preset_anna", format: "mp3" });
 * await import("node:fs/promises").then(fs => fs.writeFile("speech.mp3", audio));
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const DEFAULT_BASE_URL = "https://ttsapi.ru";

export class VoiceKitError extends Error {
  /**
   * @param {number} status HTTP status code.
   * @param {string} message Human-readable message.
   * @param {string} [code] Machine-readable error code.
   */
  constructor(status, message, code = "") {
    super(message);
    this.name = "VoiceKitError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Audio input: raw bytes or a path to a local file.
 * @typedef {Uint8Array | string} AudioSource
 */

/**
 * Client options.
 * @typedef {object} VoiceKitClientOptions
 * @property {string} apiKey API key (required).
 * @property {string} [baseUrl] API base URL. Defaults to `https://ttsapi.ru`.
 * @property {number} [timeoutMs] Per-request timeout in milliseconds. Defaults to 120000.
 */

export class VoiceKitClient {
  /**
   * @param {VoiceKitClientOptions} options
   */
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = 120_000 }) {
    if (!apiKey) throw new Error("apiKey is required");
    /** @private */ this._baseUrl = baseUrl.replace(/\/+$/, "");
    /** @private */ this._headers = { "X-Api-Key": apiKey };
    /** @private */ this._timeoutMs = timeoutMs;
  }

  // ──────────────────────── Synthesis ────────────────────────────────

  /**
   * Synthesize speech and return raw audio bytes.
   * @param {string} text
   * @param {object} [opts]
   * @returns {Promise<Uint8Array>}
   */
  async synthesize(text, opts = {}) {
    const body = compact({ text, ...opts });
    const response = await this.#request("/v1/synthesize", { method: "POST", json: body });
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Synthesize and yield audio chunks as they are produced (Pro/Business).
   * @param {string} text
   * @param {object} [opts]
   * @returns {AsyncGenerator<Uint8Array>}
   */
  async *synthesizeStream(text, opts = {}) {
    const body = compact({ text, ...opts });
    const response = await this.#request("/v1/synthesize/stream", { method: "POST", json: body });
    const reader = response.body?.getReader();
    if (!reader) return;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) yield value;
    }
  }

  /**
   * Queue a long-form (audiobook) synthesis job; poll with `getSynthesisJob()`.
   * Long-form synthesis returns WAV only.
   * @param {string} text
   * @param {object} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  async synthesizeAsync(text, opts = {}) {
    const { webhookUrl, ...body } = opts;
    const query = webhookUrl ? `?webhookUrl=${encodeURIComponent(webhookUrl)}` : "";
    const response = await this.#request(`/v1/synthesize/async${query}`, {
      method: "POST",
      json: compact({ text, ...body }),
    });
    return response.json();
  }

  /**
   * Poll a long-form synthesis job; returns the audiobook manifest when done.
   * @param {string} jobId
   * @returns {Promise<Record<string, unknown>>}
   */
  getSynthesisJob(jobId) {
    return this.#getJson(`/v1/synthesize/async/${jobId}`);
  }

  /**
   * Download the produced WAV for a completed long-form synthesis job.
   * @param {string} jobId
   * @returns {Promise<Uint8Array>}
   */
  async downloadSynthesisAudio(jobId) {
    const response = await this.#request(`/v1/synthesize/async/${jobId}/audio`);
    return new Uint8Array(await response.arrayBuffer());
  }

  /** @returns {Promise<Array<Record<string, unknown>>>} */
  voices() {
    return this.#getJson("/v1/voices");
  }

  /**
   * @param {string} id Voice id, e.g. `preset_anna`.
   * @returns {Promise<Record<string, unknown>>}
   */
  voice(id) {
    return this.#getJson(`/v1/voices/${id}`);
  }

  // ──────────────────────── Voice cloning ────────────────────────────

  /**
   * Create a cloned voice from reference audio (Pro/Business).
   * @param {{ name: string, promptText: string, samples: AudioSource | AudioSource[], language?: string }} input
   * @returns {Promise<Record<string, unknown>>}
   */
  async createCloneVoice({ name, promptText, samples, language }) {
    const sampleList = Array.isArray(samples) ? samples : [samples];
    const form = new FormData();
    form.append("name", name);
    form.append("prompt_text", promptText);
    if (language) form.append("language", language);
    for (const sample of sampleList) {
      const { data, filename } = await audioToParts(sample);
      form.append("samples", new Blob([data], { type: "audio/wav" }), filename);
    }
    const response = await this.#request("/v1/voices/clone", { method: "POST", form });
    return response.json();
  }

  /** @returns {Promise<Array<Record<string, unknown>>>} */
  listCloneVoices() {
    return this.#getJson("/v1/voices/clone");
  }

  /**
   * @param {string} cloneId
   * @returns {Promise<Record<string, unknown>>}
   */
  getCloneVoice(cloneId) {
    return this.#getJson(`/v1/voices/clone/${cloneId}`);
  }

  /**
   * @param {string} cloneId
   * @returns {Promise<void>}
   */
  async deleteCloneVoice(cloneId) {
    await this.#request(`/v1/voices/clone/${cloneId}`, { method: "DELETE" });
  }

  // ──────────────────────── Transcription ────────────────────────────

  /**
   * Start an async transcription job; poll with `getTranscriptionJob()`.
   * @param {AudioSource} audio
   * @param {object} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  async transcribe(audio, opts = {}) {
    return this.#postForm("/v1/transcribe", audio, opts);
  }

  /**
   * Transcribe a short file (≤ 3 min) synchronously.
   * @param {AudioSource} audio
   * @param {object} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  async transcribeSync(audio, opts = {}) {
    return this.#postForm("/v1/transcribe/sync", audio, opts);
  }

  /**
   * @param {string} jobId
   * @returns {Promise<Record<string, unknown>>}
   */
  getTranscriptionJob(jobId) {
    return this.#getJson(`/v1/transcribe/${jobId}`);
  }

  /**
   * Download VTT/SRT subtitles for a completed transcription job.
   * @param {string} jobId
   * @param {"vtt" | "srt"} [format]
   * @param {{ targetLanguage?: string, hotMarks?: boolean }} [opts]
   * @returns {Promise<string>}
   */
  async subtitles(jobId, format = "vtt", opts = {}) {
    const params = new URLSearchParams({ format });
    if (opts.targetLanguage) params.set("target_language", opts.targetLanguage);
    if (opts.hotMarks) params.set("hot_marks", "true");
    const response = await this.#request(`/v1/transcribe/${jobId}/subtitles?${params.toString()}`);
    return response.text();
  }

  /**
   * Translate a completed transcription job's transcript.
   * @param {string} jobId
   * @param {string} targetLanguage
   * @returns {Promise<Record<string, unknown>>}
   */
  translateTranscript(jobId, targetLanguage) {
    return this.#postJson(`/v1/transcribe/${jobId}/translate`, { target_language: targetLanguage });
  }

  /**
   * Detect speech segments in an audio file (Silero VAD).
   * @param {AudioSource} audio
   * @returns {Promise<Record<string, unknown>>}
   */
  vad(audio) {
    return this.#postForm("/v1/vad", audio, {});
  }

  /**
   * Analyze a voice recording and return a voice passport (language, gender,
   * age group, emotional background, speaker embedding and an AI-vs-human
   * probability — beta, null when the detector is not configured).
   * @param {AudioSource} audio
   * @returns {Promise<Record<string, unknown>>}
   */
  voiceId(audio) {
    return this.#postForm("/v1/voice-id", audio, {});
  }

  /**
   * Enroll an audio clip as a reusable voice profile (voiceprint).
   * @param {AudioSource} audio
   * @param {string} [name]
   * @returns {Promise<Record<string, unknown>>}
   */
  enrollVoice(audio, name) {
    return this.#postForm("/v1/voice-id/enroll", audio, { name });
  }

  /**
   * Verify an audio clip against an enrolled profile (1:1).
   * @param {AudioSource} audio
   * @param {string} profileId
   * @returns {Promise<Record<string, unknown>>}
   */
  verifyVoice(audio, profileId) {
    return this.#postForm("/v1/voice-id/verify", audio, { profile_id: profileId });
  }

  /**
   * Identify the closest matching profile for an audio clip (1:N).
   * @param {AudioSource} audio
   * @param {string[]} [profileIds]
   * @returns {Promise<Record<string, unknown>>}
   */
  identifyVoice(audio, profileIds) {
    const data = profileIds && profileIds.length
      ? { profile_ids: profileIds.join(",") }
      : {};
    return this.#postForm("/v1/voice-id/identify", audio, data);
  }

  /**
   * List the caller's enrolled voice profiles.
   * @returns {Promise<Array<Record<string, unknown>>>}
   */
  listVoiceProfiles() {
    return this.#getJson("/v1/voice-id/profiles");
  }

  /**
   * Delete an enrolled voice profile by id.
   * @param {string} profileId
   * @returns {Promise<void>}
   */
  async deleteVoiceProfile(profileId) {
    await this.#request(`/v1/voice-id/profiles/${profileId}`, { method: "DELETE" });
  }

  // ──────────────────────── Analysis ─────────────────────────────────

  /**
   * Start an async analysis job; poll with `getAnalysisJob()`.
   * @param {AudioSource} audio
   * @param {object} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  async analyze(audio, opts = {}) {
    return this.#postForm("/v1/analyze", audio, opts);
  }

  /**
   * Analyze a short file (≤ 3 min) synchronously.
   * @param {AudioSource} audio
   * @param {object} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  async analyzeSync(audio, opts = {}) {
    return this.#postForm("/v1/analyze/sync", audio, opts);
  }

  /**
   * @param {string} jobId
   * @returns {Promise<Record<string, unknown>>}
   */
  getAnalysisJob(jobId) {
    return this.#getJson(`/v1/analyze/${jobId}`);
  }

  // ──────────────────────── Text intelligence ────────────────────────

  /** @param {string} text */
  detectLanguage(text) {
    return this.#postJson("/v1/detect-language", { text });
  }

  /** @param {string} text */
  redact(text, language) {
    return this.#postJson("/v1/redact", compact({ text, language }));
  }

  /** @param {string} text */
  topics(text, language) {
    return this.#postJson("/v1/analyze/topics", compact({ text, language }));
  }

  /** @param {string} text */
  summarize(text, language, maxSentences) {
    return this.#postJson(
      "/v1/analyze/summarize",
      compact({ text, language, max_sentences: maxSentences }),
    );
  }

  /**
   * Flag profanity, insults and hate speech in raw text.
   * @param {string} text
   * @param {string} [language]
   * @returns {Promise<Record<string, unknown>>}
   */
  moderate(text, language) {
    return this.#postJson("/v1/moderate", compact({ text, language }));
  }

  // ──────────────────────── Audio / video effects ───────────────────

  /**
   * Start an async audio-effects job; poll with `getAudioEffectsJob()`.
   * @param {AudioSource} audio
   * @param {Array<Record<string, unknown>>} effects Effect descriptors.
   * @param {{ outputFormat?: string, webhookUrl?: string }} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  async applyAudioEffects(audio, effects, opts = {}) {
    const { outputFormat = "wav", webhookUrl } = opts;
    const { data, filename } = await audioToParts(audio);
    const form = new FormData();
    form.append("audio", new Blob([data], { type: "audio/wav" }), filename);
    form.append("effects", JSON.stringify(effects));
    form.append("output_format", outputFormat);
    const query = webhookUrl ? `?webhookUrl=${encodeURIComponent(webhookUrl)}` : "";
    const response = await this.#request(`/v1/audio/effects${query}`, { method: "POST", form });
    return response.json();
  }

  /**
   * Poll an audio-effects job; returns the manifest when completed.
   * @param {string} jobId
   * @returns {Promise<Record<string, unknown>>}
   */
  getAudioEffectsJob(jobId) {
    return this.#getJson(`/v1/audio/effects/${jobId}`);
  }

  /**
   * Download the produced audio for a completed audio-effects job.
   * @param {string} jobId
   * @returns {Promise<Uint8Array>}
   */
  async downloadAudioEffects(jobId) {
    const response = await this.#request(`/v1/audio/effects/${jobId}/audio`);
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Start an async video-effects job; poll with `getVideoEffectsJob()`.
   * @param {AudioSource} video
   * @param {Array<Record<string, unknown>>} effects Effect descriptors.
   * @param {{ mode?: string, audio?: AudioSource, outputFormat?: string, webhookUrl?: string }} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  async applyVideoEffects(video, effects, opts = {}) {
    const { mode = "mux", audio, outputFormat, webhookUrl } = opts;
    const { data, filename } = await audioToParts(video);
    const form = new FormData();
    form.append("video", new Blob([data], { type: "video/mp4" }), filename);
    if (audio) {
      const parts = await audioToParts(audio);
      form.append("audio", new Blob([parts.data], { type: "audio/wav" }), parts.filename);
    }
    form.append("effects", JSON.stringify(effects));
    form.append("mode", mode);
    if (outputFormat) form.append("output_format", outputFormat);
    const query = webhookUrl ? `?webhookUrl=${encodeURIComponent(webhookUrl)}` : "";
    const response = await this.#request(`/v1/video/effects${query}`, { method: "POST", form });
    return response.json();
  }

  /**
   * Poll a video-effects job; returns the manifest when completed.
   * @param {string} jobId
   * @returns {Promise<Record<string, unknown>>}
   */
  getVideoEffectsJob(jobId) {
    return this.#getJson(`/v1/video/effects/${jobId}`);
  }

  /**
   * Download the produced artifact (video or audio) for a video-effects job.
   * @param {string} jobId
   * @returns {Promise<Uint8Array>}
   */
  async downloadVideoEffects(jobId) {
    const response = await this.#request(`/v1/video/effects/${jobId}/file`);
    return new Uint8Array(await response.arrayBuffer());
  }

  // ──────────────────────── Audio cleaning ───────────────────────────

  /**
   * Start an async audio-cleaning job; poll with `getAudioCleaningJob()`.
   * With no `options` the one-click preset (denoise + normalize) is applied.
   * @param {AudioSource} audio
   * @param {{ options?: Record<string, unknown>, outputFormat?: string, webhookUrl?: string }} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  async cleanAudio(audio, opts = {}) {
    const { options, outputFormat = "wav", webhookUrl } = opts;
    const { data, filename } = await audioToParts(audio);
    const form = new FormData();
    form.append("audio", new Blob([data], { type: "audio/wav" }), filename);
    form.append("output_format", outputFormat);
    if (options) form.append("options", JSON.stringify(options));
    const query = webhookUrl ? `?webhookUrl=${encodeURIComponent(webhookUrl)}` : "";
    const response = await this.#request(`/v1/audio/clean${query}`, { method: "POST", form });
    return response.json();
  }

  /**
   * Poll an audio-cleaning job; returns the manifest when completed.
   * @param {string} jobId
   * @returns {Promise<Record<string, unknown>>}
   */
  getAudioCleaningJob(jobId) {
    return this.#getJson(`/v1/audio/clean/${jobId}`);
  }

  /**
   * Download the cleaned audio for a completed audio-cleaning job.
   * @param {string} jobId
   * @returns {Promise<Uint8Array>}
   */
  async downloadAudioCleaning(jobId) {
    const response = await this.#request(`/v1/audio/clean/${jobId}/audio`);
    return new Uint8Array(await response.arrayBuffer());
  }

  // ──────────────────────── Batch ────────────────────────────────────

  /**
   * Queue a batch of synthesis requests; poll with `getBatch()`.
   * @param {Array<Record<string, unknown>>} items
   * @returns {Promise<Record<string, unknown>>}
   */
  batchSynthesize(items) {
    return this.#postJson("/v1/batch/synthesize", { items });
  }

  /**
   * Queue a batch of analysis requests; each item needs inline base64 `audio`.
   * @param {Array<Record<string, unknown>>} items
   * @returns {Promise<Record<string, unknown>>}
   */
  batchAnalyze(items) {
    return this.#postJson("/v1/batch/analyze", { items });
  }

  /**
   * @param {string} batchId
   * @returns {Promise<Record<string, unknown>>}
   */
  getBatch(batchId) {
    return this.#getJson(`/v1/batch/${batchId}`);
  }

  // ──────────────────────── Account ──────────────────────────────────

  /** @returns {Promise<Record<string, unknown>>} */
  usage() {
    return this.#getJson("/v1/usage");
  }

  /** @returns {Promise<Record<string, unknown>>} */
  billingBalance() {
    return this.#getJson("/v1/billing/balance");
  }

  // ──────────────────────── Recordings ───────────────────────────────

  /**
   * List the caller's recordings (newest first).
   * @param {{ source?: string, limit?: number, offset?: number }} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  listRecordings({ source, limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (source) params.set("source", source);
    return this.#getJson(`/v1/recordings?${params.toString()}`);
  }

  /**
   * Start a diarized transcription from a public audio URL (Link channel).
   * @param {string} url
   * @param {string} [language]
   * @returns {Promise<Record<string, unknown>>}
   */
  recordingFromLink(url, language) {
    return this.#postJson("/v1/recordings/from-link", compact({ url, language }));
  }

  /**
   * @param {string} recordingId
   * @returns {Promise<Record<string, unknown>>}
   */
  getRecording(recordingId) {
    return this.#getJson(`/v1/recordings/${recordingId}`);
  }

  /**
   * @param {string} recordingId
   * @returns {Promise<Record<string, unknown>>}
   */
  getRecordingTranscript(recordingId) {
    return this.#getJson(`/v1/recordings/${recordingId}/transcript`);
  }

  /**
   * Fetch a recording's speakers, timeline and conversation metrics.
   * @param {string} recordingId
   * @returns {Promise<Record<string, unknown>>}
   */
  recordingSpeakers(recordingId) {
    return this.#getJson(`/v1/recordings/${recordingId}/speakers`);
  }

  /**
   * Rename a speaker or assign a role (operator/client/participant).
   * @param {string} recordingId
   * @param {string} speakerId
   * @param {{ displayName?: string, role?: string }} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  async updateSpeaker(recordingId, speakerId, opts = {}) {
    const response = await this.#request(
      `/v1/recordings/${recordingId}/speakers/${speakerId}`,
      { method: "PATCH", json: compact({ display_name: opts.displayName, role: opts.role }) },
    );
    return response.json();
  }

  /**
   * Delete a recording and its stored audio.
   * @param {string} recordingId
   * @returns {Promise<void>}
   */
  async deleteRecording(recordingId) {
    await this.#request(`/v1/recordings/${recordingId}`, { method: "DELETE" });
  }

  /**
   * Download a recording's stored audio.
   * @param {string} recordingId
   * @returns {Promise<Uint8Array>}
   */
  async downloadRecordingAudio(recordingId) {
    const response = await this.#request(`/v1/recordings/${recordingId}/audio`);
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Export a recording's transcript (txt|md|srt|vtt|docx).
   * @param {string} recordingId
   * @param {"txt" | "md" | "srt" | "vtt" | "docx"} [format]
   * @returns {Promise<Uint8Array>}
   */
  async exportRecording(recordingId, format = "txt") {
    const response = await this.#request(
      `/v1/recordings/${recordingId}/export?format=${format}`,
    );
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Create a public share link for a recording.
   * @param {string} recordingId
   * @param {{ expiresInSeconds?: number, password?: string }} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  createShare(recordingId, opts = {}) {
    return this.#postJson(
      `/v1/recordings/${recordingId}/share`,
      compact({ expires_in_seconds: opts.expiresInSeconds, password: opts.password }),
    );
  }

  /**
   * List the active share links for a recording.
   * @param {string} recordingId
   * @returns {Promise<Array<Record<string, unknown>>>}
   */
  listShares(recordingId) {
    return this.#getJson(`/v1/recordings/${recordingId}/share`);
  }

  /**
   * Revoke a share link.
   * @param {string} recordingId
   * @param {string} token
   * @returns {Promise<void>}
   */
  async revokeShare(recordingId, token) {
    await this.#request(`/v1/recordings/${recordingId}/share/${token}`, { method: "DELETE" });
  }

  // ──────────────────────── Call QA (7.7) ────────────────────────────

  /**
   * Evaluate a recording against a QA checklist (Pro/Business).
   * @param {string} recordingId
   * @param {Array<Record<string, unknown>>} checklist
   * @param {{ webhookUrl?: string }} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  qaEvaluate(recordingId, checklist, opts = {}) {
    return this.#postJson(
      "/v1/qa/evaluate",
      compact({ recording_id: recordingId, checklist, webhook_url: opts.webhookUrl }),
    );
  }

  /**
   * Aggregated QA analytics: score trend, top violations, score by operator.
   * @param {number} [days]
   * @returns {Promise<Record<string, unknown>>}
   */
  qaAnalytics(days = 30) {
    return this.#getJson(`/v1/qa/analytics?days=${days}`);
  }

  /**
   * List the caller's persisted QA evaluations (newest first).
   * @param {{ limit?: number, offset?: number }} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  qaEvaluations({ limit = 20, offset = 0 } = {}) {
    return this.#getJson(`/v1/qa/evaluations?limit=${limit}&offset=${offset}`);
  }

  /**
   * Export QA evaluations as CSV/JSON for CRM import.
   * @param {"csv" | "json"} [format]
   * @param {number} [days]
   * @returns {Promise<Uint8Array>}
   */
  async qaExport(format = "csv", days = 30) {
    const response = await this.#request(
      `/v1/qa/evaluations/export?format=${format}&days=${days}`,
    );
    return new Uint8Array(await response.arrayBuffer());
  }

  // ──────────────────────── Search & Q&A (7.6) ────────────────────────

  /**
   * Hybrid semantic/full-text search over recordings (Pro/Business).
   * @param {string} query
   * @param {{
   *   limit?: number,
   *   keywords?: string,
   *   source?: "upload" | "link" | "bot" | "stream",
   *   speaker?: string,
   *   from?: string,
   *   to?: string,
   *   minDurationSeconds?: number,
   *   maxDurationSeconds?: number,
   * }} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  search(query, opts = {}) {
    return this.#postJson(
      "/v1/search",
      compact({
        query,
        limit: opts.limit,
        keywords: opts.keywords,
        source: opts.source,
        speaker: opts.speaker,
        from: opts.from,
        to: opts.to,
        min_duration_seconds: opts.minDurationSeconds,
        max_duration_seconds: opts.maxDurationSeconds,
      }),
    );
  }

  /**
   * Answer a question over recordings (RAG) with verbatim citations.
   * @param {string} query
   * @returns {Promise<Record<string, unknown>>}
   */
  ask(query) {
    return this.#postJson("/v1/ask", { query });
  }

  // ──────────────────────── Meeting intelligence ────────────────────

  /**
   * Generate a meeting protocol (TL;DR, decisions, tasks, risks, next steps).
   * @param {string} recordingId
   * @param {"custom" | "standup" | "demo" | "interview" | "retro" | "one_on_one"} [template]
   * @returns {Promise<Record<string, unknown>>}
   */
  meetingProtocol(recordingId, template = "custom") {
    return this.#postJson("/v1/meetings/protocol", { recording_id: recordingId, template });
  }

  // ──────────────────────── Speech evaluation (WER) ──────────────────

  /**
   * Evaluate speech quality against a reference text (word error rate).
   * @param {AudioSource} audio
   * @param {string} reference
   * @param {{ language?: string, normalize?: boolean }} [opts]
   * @returns {Promise<Record<string, unknown>>}
   */
  evaluate(audio, reference, opts = {}) {
    return this.#postForm("/v1/eval", audio, {
      reference,
      language: opts.language,
      normalize: opts.normalize,
    });
  }

  // ──────────────────────── Streaming (WebSocket) ────────────────────

  /**
   * Open a streaming transcription session (Pro/Business).
   * @param {{ language?: string, keyterms?: string[], interim?: boolean }} [opts]
   * @returns {Promise<WsStream>}
   */
  async transcribeStream({ language, keyterms, interim = true } = {}) {
    const url = this.#wsUrl("/v1/transcribe/stream", {
      language,
      keyterms: Array.isArray(keyterms) ? keyterms.join(",") : undefined,
      interim,
    });
    return openWsStream(url, this._headers);
  }

  /**
   * Open a streaming turn-detection session (VAD events only).
   * @returns {Promise<WsStream>}
   */
  async vadStream() {
    const url = this.#wsUrl("/v1/vad/stream", {});
    return openWsStream(url, this._headers);
  }

  // ──────────────────────── Transport ────────────────────────────────

  /**
   * @param {string} path
   * @returns {Promise<Record<string, unknown>>}
   */
  async #getJson(path) {
    const response = await this.#request(path);
    return response.json();
  }

  /**
   * @param {string} path
   * @param {Record<string, unknown>} body
   * @returns {Promise<Record<string, unknown>>}
   */
  async #postJson(path, body) {
    const response = await this.#request(path, { method: "POST", json: body });
    return response.json();
  }

  /**
   * @param {string} path
   * @param {AudioSource} audio
   * @param {object} opts
   * @returns {Promise<Record<string, unknown>>}
   */
  async #postForm(path, audio, opts) {
    const { data, filename } = await audioToParts(audio);
    const form = new FormData();
    form.append("audio", new Blob([data], { type: "audio/wav" }), filename);

    const { keyterms, ...rest } = opts;
    for (const [key, value] of Object.entries(compact(rest))) {
      form.append(key, String(value));
    }
    if (Array.isArray(keyterms) && keyterms.length) {
      form.append("keyterms", keyterms.join(","));
    }

    const response = await this.#request(path, { method: "POST", form });
    return response.json();
  }

  /**
   * @param {string} path
   * @param {{ method?: string, json?: unknown, form?: FormData }} [options]
   * @returns {Promise<Response>}
   */
  async #request(path, { method = "GET", json, form } = {}) {
    const headers = { ...this._headers };
    const init = { method, headers, signal: AbortSignal.timeout(this._timeoutMs) };

    if (json !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(json);
    } else if (form !== undefined) {
      init.body = form;
    }

    const response = await fetch(`${this._baseUrl}${path}`, init);
    if (!response.ok) {
      let code = "";
      let detail = await response.text();
      try {
        const payload = JSON.parse(detail);
        code = payload.code ?? "";
        detail = payload.detail ?? payload.title ?? detail;
      } catch {
        /* not JSON */
      }
      throw new VoiceKitError(response.status, detail, code);
    }
    return response;
  }

  /**
   * Build a `ws(s)://` URL for a streaming endpoint from the base URL.
   * @param {string} path
   * @param {Record<string, unknown>} params
   * @returns {string}
   */
  #wsUrl(path, params) {
    const url = new URL(this._baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = path;
    url.search = "";
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}

/**
 * @param {AudioSource} audio
 * @returns {Promise<{ data: Uint8Array, filename: string }>}
 */
async function audioToParts(audio) {
  if (audio instanceof Uint8Array) {
    return { data: audio, filename: "audio.wav" };
  }
  const data = await readFile(audio);
  return { data: new Uint8Array(data), filename: basename(audio) };
}

/**
 * Encode audio as base64 for `batchAnalyze()`.
 * @param {AudioSource} audio
 * @returns {Promise<string>}
 */
export async function b64(audio) {
  const { data } = await audioToParts(audio);
  return Buffer.from(data).toString("base64");
}

/**
 * @param {Record<string, unknown>} object
 * @returns {Record<string, unknown>}
 */
function compact(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null),
  );
}

// ──────────────────────── WebSocket streaming ─────────────────────────

/**
 * A connected streaming session (transcription or VAD).
 */
export class WsStream {
  /**
   * @param {import("ws")} ws
   */
  constructor(ws) {
    /** @private */ this._ws = ws;
    // Prevent unhandled 'error' events from crashing the process mid-session.
    ws.on("error", () => {});
  }

  /**
   * Send raw PCM16 (16 kHz, mono, little-endian) audio.
   * @param {Uint8Array} pcm16
   * @returns {Promise<void>}
   */
  sendAudio(pcm16) {
    return new Promise((resolve, reject) => {
      this._ws.send(pcm16, (err) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Send a text frame (objects are JSON-encoded).
   * @param {unknown} payload
   * @returns {Promise<void>}
   */
  sendText(payload) {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      this._ws.send(text, (err) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Signal end of speech so the server finalizes the utterance.
   * @returns {Promise<void>}
   */
  stop() {
    return this.sendText({ type: "stop" });
  }

  /**
   * Receive JSON events (`session`, `vad`, `partial`, `final`, `error`).
   * @returns {AsyncGenerator<Record<string, unknown>>}
   */
  async *events() {
    for await (const message of this._ws) {
      yield typeof message === "string" ? JSON.parse(message) : JSON.parse(message.toString("utf8"));
    }
  }

  /** Close the session. */
  close() {
    this._ws.close();
  }
}

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 * @returns {Promise<WsStream>}
 */
async function openWsStream(url, headers) {
  const { default: WebSocket } = await import("ws");
  const ws = new WebSocket(url, { headers });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return new WsStream(ws);
}
