import { DEFAULT_SETTINGS, findGenderVoiceSetting } from "../constants.js";
import { SETTINGS_FILE } from "../utils/paths.js";
import { JsonFile } from "../utils/json-file.js";
import type { AppSettings, JobVoiceGender } from "../types.js";
import { parseSettings } from "../validation.js";

export class SettingsStore {
  private readonly file = new JsonFile<AppSettings>(SETTINGS_FILE, DEFAULT_SETTINGS);

  public async get(): Promise<AppSettings> {
    const settings = await this.file.get();
    try {
      return parseSettings(settings);
    } catch (error) {
      throw new Error(
        `Settings file tidak valid (${SETTINGS_FILE}): ${
          (error as { message?: string })?.message || "format settings tidak sesuai"
        }`
      );
    }
  }

  public async set(next: AppSettings): Promise<AppSettings> {
    const parsed = parseSettings(next);
    await this.file.set(parsed);
    return parsed;
  }

  public async getVoiceForGender(gender: JobVoiceGender): Promise<{
    voiceName: string;
    speechRate: number;
  }> {
    const settings = await this.get();
    const selected = findGenderVoiceSetting(settings, gender);
    if (!selected) {
      throw new Error(`Default voice untuk gender ${gender} belum dikonfigurasi.`);
    }
    return {
      voiceName: selected.voiceName,
      speechRate: selected.speechRate
    };
  }
}
