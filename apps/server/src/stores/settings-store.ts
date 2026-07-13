import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ABSOLUTE_MAX_VIDEO_SECONDS,
  DEFAULT_SETTINGS,
  findDefaultVoiceForGender,
  findGenderVoiceSetting,
  findTtsVoiceByName,
  isKnownTtsVoiceName,
  normalizeScriptModel,
  normalizeTtsModel
} from "../constants.js";
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
    private readonly runtimeModelOverrides?: Partial<
      Pick<AppSettings, "scriptModel" | "ttsModel" | "scriptProvider" | "ttsProvider">
    >
  ) {}

  private applyRuntimeModelOverrides(settings: AppSettings): AppSettings {
    const scriptModel = this.runtimeModelOverrides?.scriptModel?.trim();
    const ttsModel = this.runtimeModelOverrides?.ttsModel?.trim();
    const scriptProvider = this.runtimeModelOverrides?.scriptProvider?.trim();
    const ttsProvider = this.runtimeModelOverrides?.ttsProvider?.trim();

    if (!scriptModel && !ttsModel && !scriptProvider && !ttsProvider) {
      return settings;
    }

    const nextScriptProvider =
      scriptProvider === "openrouter" || scriptProvider === "aivene"
        ? scriptProvider
        : settings.scriptProvider;
    const nextTtsProvider =
      ttsProvider === "openrouter" || ttsProvider === "aivene"
        ? ttsProvider
        : settings.ttsProvider;
    const nextTtsModel = normalizeTtsModel(ttsModel || settings.ttsModel, nextTtsProvider);

    return {
      ...settings,
      scriptProvider: nextScriptProvider,
      scriptModel: normalizeScriptModel(scriptModel || settings.scriptModel, nextScriptProvider),
      ttsProvider: nextTtsProvider,
      ttsModel: nextTtsModel,
      genderVoices: DEFAULT_SETTINGS.genderVoices.map((fallbackVoice) => {
        const selected = settings.genderVoices.find((voice) => voice.gender === fallbackVoice.gender);
        const fallbackProviderVoice = findDefaultVoiceForGender(nextTtsProvider, fallbackVoice.gender, nextTtsModel);
        return {
          gender: fallbackVoice.gender,
          voiceName:
            selected?.voiceName && isKnownTtsVoiceName(selected.voiceName, nextTtsProvider, nextTtsModel)
              ? findTtsVoiceByName(selected.voiceName, nextTtsProvider, nextTtsModel)?.voiceName ||
                fallbackProviderVoice.voiceName
              : fallbackProviderVoice.voiceName,
          speechRate: Number.isFinite(Number(selected?.speechRate))
            ? Number(selected?.speechRate)
            : fallbackVoice.speechRate
        };
      })
    };
  }

  private normalizeLegacySettings(settings: AppSettings): AppSettings {
    const scriptProvider = settings.scriptProvider || DEFAULT_SETTINGS.scriptProvider;
    const ttsProvider = settings.ttsProvider || DEFAULT_SETTINGS.ttsProvider;
    const normalizedTtsModel = normalizeTtsModel(settings.ttsModel, ttsProvider);
    return {
      ...settings,
      scriptProvider,
      scriptFallbackProvider:
        settings.scriptFallbackProvider || DEFAULT_SETTINGS.scriptFallbackProvider,
      scriptModel: normalizeScriptModel(
        settings.scriptModel,
        scriptProvider
      ),
      ttsProvider,
      ttsFallbackProvider: settings.ttsFallbackProvider || DEFAULT_SETTINGS.ttsFallbackProvider,
      ttsModel: normalizedTtsModel,
      genderVoices: DEFAULT_SETTINGS.genderVoices.map((fallbackVoice) => {
        const selected = settings.genderVoices?.find((voice) => voice.gender === fallbackVoice.gender);
        const fallbackProviderVoice = findDefaultVoiceForGender(ttsProvider, fallbackVoice.gender, normalizedTtsModel);
        return {
          gender: fallbackVoice.gender,
          voiceName:
            selected?.voiceName && isKnownTtsVoiceName(selected.voiceName, ttsProvider, normalizedTtsModel)
              ? findTtsVoiceByName(selected.voiceName, ttsProvider, normalizedTtsModel)?.voiceName ||
                fallbackProviderVoice.voiceName
              : fallbackProviderVoice.voiceName,
          speechRate: Number.isFinite(Number(selected?.speechRate))
            ? Number(selected?.speechRate)
            : fallbackVoice.speechRate
        };
      })
    };
  }

  private applyHardCaps(raw: unknown): unknown {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return raw;
    }
    const record = raw as Record<string, unknown>;
    const maxVideoSecondsRaw = record.maxVideoSeconds;
    const numeric =
      typeof maxVideoSecondsRaw === "number"
        ? maxVideoSecondsRaw
        : Number(String(maxVideoSecondsRaw ?? ""));
    const clamped = Number.isFinite(numeric)
      ? Math.max(10, Math.min(ABSOLUTE_MAX_VIDEO_SECONDS, Math.trunc(numeric)))
      : ABSOLUTE_MAX_VIDEO_SECONDS;
    return {
      ...record,
      maxVideoSeconds: clamped
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
        this.normalizeLegacySettings(
          parseSettings(this.applyHardCaps(data ? appSettingsRowToSettings(data as AppSettingsRow) : DEFAULT_SETTINGS))
        )
      );
    }

    const settings = await this.file.get();
    try {
      return this.applyRuntimeModelOverrides(
        this.normalizeLegacySettings(parseSettings(this.applyHardCaps(settings)))
      );
    } catch (error) {
      throw new Error(
        `Settings file tidak valid (${SETTINGS_FILE}): ${
          (error as { message?: string })?.message || "format settings tidak sesuai"
        }`
      );
    }
  }

  public async set(next: AppSettings, client?: SupabaseClient): Promise<AppSettings> {
    const parsed = this.normalizeLegacySettings(parseSettings(next));
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
