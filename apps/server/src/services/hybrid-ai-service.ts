import type { AiService, ContentAiService, SpeechService } from "./ai-service.js";
import type {
  GenerateCaptionMetadataInput,
  GenerateScriptInput,
  GenerateSpeechInput,
  GenerateVisualBriefInput
} from "../types.js";

export class HybridAiService implements AiService {
  public constructor(
    private readonly contentService: ContentAiService,
    private readonly speechService: SpeechService
  ) {}

  public async uploadVideo(filePath: string, mimeType: string) {
    return await this.contentService.uploadVideo(filePath, mimeType);
  }

  public async generateScript(input: GenerateScriptInput) {
    return await this.contentService.generateScript(input);
  }

  public async generateVisualBrief(input: GenerateVisualBriefInput) {
    return await this.contentService.generateVisualBrief(input);
  }

  public async generateCaptionMetadata(input: GenerateCaptionMetadataInput) {
    return await this.contentService.generateCaptionMetadata(input);
  }

  public async generateSpeech(input: GenerateSpeechInput) {
    return await this.speechService.generateSpeech(input);
  }
}
