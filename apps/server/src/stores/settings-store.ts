import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS, findGenderVoiceSetting } from "../constants.js";
import { SETTINGS_FILE } from "../utils/paths.js";
import { JsonFile } from "../utils/json-file.js";
import type { AppSettings, JobVoiceGender } from "../types.js";
import { parseSettings } from "../validation.js";
import type { AppSettingsRow } from "../services/supabase-schema.js";
import { appSettingsRowToSettings, appSettingsToRow } from "../services/supabase-schema.js";

export class SettingsStore {
  private readonly file = new JsonFile<AppSettings>(SETTINGS_FILE, DEFAULT_SETTINGS);

  public constructor(
    private readonly adminClient?: SupabaseClient,
    private readonly runtimeModelOverrides?: Partial<Pick<AppSettings, "scriptModel" | "ttsModel">>
  ) {}

  private applyRuntimeModelOverrides(settings: AppSettings): AppSettings {
    const scriptModel = this.runtimeModelOverrides?.scriptModel?.trim();
    const ttsModel = this.runtimeModelOverrides?.ttsModel?.trim();

    if (!scriptModel && !ttsModel) {
      return settings;
    }

    return {
      ...settings,
      scriptModel: scriptModel || settings.scriptModel,
      ttsModel: ttsModel || settings.ttsModel
    };
  }

  public async get(client?: SupabaseClient): Promise<AppSettings> {
    const db = client ?? this.adminClient;
    if (db) {
      const { data, error } = await db
        .from("app_settings")
        .select("*")
        .eq("settings_key", "default")
        .maybeSingle();
      if (error) {
        throw error;
      }
      return this.applyRuntimeModelOverrides(
        parseSettings(data ? appSettingsRowToSettings(data as AppSettingsRow) : DEFAULT_SETTINGS)
      );
    }

    const settings = await this.file.get();
    try {
      return this.applyRuntimeModelOverrides(parseSettings(settings));
    } catch (error) {
      throw new Error(
        `Settings file tidak valid (${SETTINGS_FILE}): ${
          (error as { message?: string })?.message || "format settings tidak sesuai"
        }`
      );
    }
  }

  public async set(next: AppSettings, client?: SupabaseClient): Promise<AppSettings> {
    const parsed = parseSettings(next);
    const db = client ?? this.adminClient;
    if (db) {
      const row = appSettingsToRow(parsed);
      const { error } = await db.from("app_settings").upsert(row, { onConflict: "settings_key" });
      if (error) {
        throw error;
      }
      return parsed;
    }

    await this.file.set(parsed);
    return parsed;
  }

  public async getVoiceForGender(
    gender: JobVoiceGender,
    client?: SupabaseClient
  ): Promise<{
    voiceName: string;
    speechRate: number;
  }> {
    const settings = await this.get(client);
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
