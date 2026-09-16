export type AudioSource = Uint8Array | string;

export interface VoiceKitClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class VoiceKitError extends Error {
  readonly status: number;
  readonly code: string;
}

export class VoiceKitClient {
  constructor(options: VoiceKitClientOptions);

  synthesize(text: string, opts?: SynthesisOptions): Promise<Uint8Array>;
  synthesizeStream(text: string, opts?: SynthesisOptions): AsyncGenerator<Uint8Array>;
  synthesizeAsync(
    text: string,
    opts?: SynthesisAsyncOptions,
  ): Promise<Record<string, unknown>>;
  getSynthesisJob(jobId: string): Promise<Record<string, unknown>>;
  downloadSynthesisAudio(jobId: string): Promise<Uint8Array>;
  voices(): Promise<Array<Record<string, unknown>>>;
  voice(id: string): Promise<Record<string, unknown>>;

  createCloneVoice(input: CloneVoiceCreateInput): Promise<Record<string, unknown>>;
  listCloneVoices(): Promise<Array<Record<string, unknown>>>;
  getCloneVoice(cloneId: string): Promise<Record<string, unknown>>;
  deleteCloneVoice(cloneId: string): Promise<void>;

  transcribe(audio: AudioSource, opts?: AudioOptions): Promise<Record<string, unknown>>;
  transcribeSync(audio: AudioSource, opts?: AudioOptions): Promise<Record<string, unknown>>;
  getTranscriptionJob(jobId: string): Promise<Record<string, unknown>>;
  subtitles(jobId: string, format?: "vtt" | "srt"): Promise<string>;
  vad(audio: AudioSource): Promise<Record<string, unknown>>;
  voiceId(audio: AudioSource): Promise<VoiceIdResult>;
  enrollVoice(audio: AudioSource, name?: string): Promise<Record<string, unknown>>;
  verifyVoice(audio: AudioSource, profileId: string): Promise<VoiceVerificationResult>;
  identifyVoice(audio: AudioSource, profileIds?: string[]): Promise<VoiceIdentificationResult>;
  listVoiceProfiles(): Promise<Array<Record<string, unknown>>>;
  deleteVoiceProfile(profileId: string): Promise<void>;

  analyze(audio: AudioSource, opts?: AudioOptions): Promise<Record<string, unknown>>;
  analyzeSync(audio: AudioSource, opts?: AudioOptions): Promise<Record<string, unknown>>;
  getAnalysisJob(jobId: string): Promise<Record<string, unknown>>;

  detectLanguage(text: string): Promise<Record<string, unknown>>;
  redact(text: string, language?: string): Promise<Record<string, unknown>>;
  topics(text: string, language?: string): Promise<Record<string, unknown>>;
  summarize(
    text: string,
    language?: string,
    maxSentences?: number,
  ): Promise<Record<string, unknown>>;

  moderate(text: string, language?: string): Promise<Record<string, unknown>>;

  applyAudioEffects(
    audio: AudioSource,
    effects: Array<Record<string, unknown>>,
    opts?: AudioEffectsOptions,
  ): Promise<Record<string, unknown>>;
  getAudioEffectsJob(jobId: string): Promise<Record<string, unknown>>;
  downloadAudioEffects(jobId: string): Promise<Uint8Array>;

  applyVideoEffects(
    video: AudioSource,
    effects: Array<Record<string, unknown>>,
    opts?: VideoEffectsOptions,
  ): Promise<Record<string, unknown>>;
  getVideoEffectsJob(jobId: string): Promise<Record<string, unknown>>;
  downloadVideoEffects(jobId: string): Promise<Uint8Array>;

  cleanAudio(
    audio: AudioSource,
    opts?: AudioCleaningOptions,
  ): Promise<Record<string, unknown>>;
  getAudioCleaningJob(jobId: string): Promise<Record<string, unknown>>;
  downloadAudioCleaning(jobId: string): Promise<Uint8Array>;

  batchSynthesize(items: Array<Record<string, unknown>>): Promise<Record<string, unknown>>;
  batchAnalyze(items: Array<Record<string, unknown>>): Promise<Record<string, unknown>>;
  getBatch(batchId: string): Promise<Record<string, unknown>>;

  usage(): Promise<Record<string, unknown>>;
  billingBalance(): Promise<Record<string, unknown>>;

  transcribeStream(opts?: TranscribeStreamOptions): Promise<WsStream>;
  vadStream(): Promise<WsStream>;
}

export interface SynthesisOptions {
  voice?: string;
  format?: "mp3" | "wav" | "ogg";
  sampleRate?: number;
  speed?: number;
  pitch?: number;
  emotion?: string;
  ssml?: boolean;
  putAccent?: boolean;
  putYo?: boolean;
  normalize?: boolean;
  model?: string;
  language?: string;
  effects?: string;
}

export interface AudioEffectsOptions {
  outputFormat?: "wav" | "mp3" | "ogg";
  webhookUrl?: string;
}

export interface VideoEffectsOptions {
  mode?: "mux" | "audio";
  audio?: AudioSource;
  outputFormat?: string;
  webhookUrl?: string;
}

export interface AudioCleaningOptions {
  options?: Record<string, unknown>;
  outputFormat?: "wav" | "mp3" | "ogg";
  webhookUrl?: string;
}

export interface VoiceIdResult {
  language: string;
  language_confidence: number;
  duration_seconds: number;
  speech_ratio: number;
  gender: string;
  gender_confidence: number;
  age_group: string;
  age_confidence: number;
  emotional_background: string;
  emotions?: Record<string, number>;
  ai_probability?: number;
  fake_detection_available: boolean;
  speaker_embedding?: number[];
  nearest_voices: VoiceIdMatch[];
  processing_time_ms: number;
}

export interface VoiceIdMatch {
  voice_id: string;
  similarity: number;
}

export interface VoiceVerificationResult {
  profile_id: string;
  similarity: number;
  verified: boolean;
  threshold: number;
}

export interface VoiceIdentificationResult {
  best_match?: VoiceIdMatch;
  matches: VoiceIdMatch[];
  threshold: number;
}

export interface VoiceProfile {
  profile_id: string;
  name: string;
  source: string;
  clone_voice_id?: string;
  created_at: string;
}

export interface SynthesisAsyncOptions {
  voice?: string;
  format?: "wav";
  sampleRate?: number;
  speed?: number;
  model?: string;
  language?: string;
  webhookUrl?: string;
}

export interface AudioOptions {
  language?: string;
  diarization?: boolean;
  webhookUrl?: string;
  keyterms?: string[];
  emotions?: boolean;
  keywords?: boolean;
  entities?: boolean;
}

export interface CloneVoiceCreateInput {
  name: string;
  promptText: string;
  samples: AudioSource | AudioSource[];
  language?: string;
}

export interface TranscribeStreamOptions {
  language?: string;
  keyterms?: string[];
  interim?: boolean;
}

export class WsStream {
  sendAudio(pcm16: Uint8Array): Promise<void>;
  sendText(payload: unknown): Promise<void>;
  stop(): Promise<void>;
  events(): AsyncGenerator<Record<string, unknown>>;
  close(): void;
}

export function b64(audio: AudioSource): Promise<string>;
