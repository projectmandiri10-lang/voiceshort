// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const macroPath = resolve(process.cwd(), "../../macrodroid/voiceshort-interactive-qris.macro");
const qrisPath = resolve(process.cwd(), "public/qris/megakomindo-qris.jpg");

describe("VoiceShort MacroDroid export", () => {
  it("contains the production endpoint, exact package, empty secure variable, and diagnostics", () => {
    const exported = JSON.parse(readFileSync(macroPath, "utf8"));
    const secureVariable = exported.globalVariables.find((entry: { m_name: string }) => entry.m_name === "VOICESHORT_QRIS_SECRET");
    const trigger = exported.macro.m_triggerList[0];
    const request = exported.macro.m_actionList[0].requestConfig;
    const toast = exported.macro.m_actionList[1];

    expect(secureVariable).toMatchObject({ isSecure: true, m_stringValue: "" });
    expect(trigger.m_packageNameList).toEqual(["com.interactive.qrisid"]);
    expect(request.urlToOpen).toBe("https://voiceshort.jho-j80.workers.dev/api/webhooks/interactive-qris");
    expect(request.headerParams).toContainEqual({
      paramName: "x-interactive-qris-secret",
      paramValue: "{v=VOICESHORT_QRIS_SECRET}"
    });
    expect(request.contentBodyText).toContain("{not_app_package}");
    expect(request.contentBodyText).toContain("{not_title}");
    expect(request.contentBodyText).toContain("{notification}");
    expect(request.contentBodyText).toContain("{not_text_big}");
    expect(request.responseVariableName).toBe("qris_webhook_response");
    expect(request.returnCodeVariableName).toBe("qris_webhook_status");
    expect(toast.m_messageText).toContain("qris_webhook_response");
  });

  it("ships the selected QRIS image as a public asset", () => {
    expect(existsSync(qrisPath)).toBe(true);
  });
});
