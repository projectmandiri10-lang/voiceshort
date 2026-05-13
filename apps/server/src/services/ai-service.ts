import type {
  GenerateCaptionMetadataInput,
  GenerateScriptInput,
  GenerateSpeechInput,
  GenerateVisualBriefInput,
  UploadedAiFile,
  VisualBrief
} from "../types.js";

export interface GeneratedAudio {
  data: Buffer;
  mimeType: string;
}

export interface ContentAiService {
  uploadVideo(filePath: string, mimeType: string): Promise<UploadedAiFile>;
  generateScript(input: GenerateScriptInput): Promise<string>;
  generateVisualBrief(input: GenerateVisualBriefInput): Promise<VisualBrief>;
  generateCaptionMetadata(
    input: GenerateCaptionMetadataInput
  ): Promise<{ caption: string; hashtags: string[] }>;
}

export interface SpeechService {
  readonly appliesSpeechRateNatively?: boolean;
  generateSpeech(input: GenerateSpeechInput): Promise<GeneratedAudio>;
}

export interface AiService extends ContentAiService, SpeechService {}

// Keep the name for backwards compatibility with existing tests/imports.
export class InvalidGeminiStructuredOutputError extends Error {
  public readonly outputType: "visualBrief";

  public constructor(outputType: "visualBrief", message: string) {
    super(message);
    this.name = "InvalidGeminiStructuredOutputError";
    this.outputType = outputType;
  }
}
