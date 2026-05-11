import pino from "pino";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { SuccessOutputRetentionSweeper } from "../src/services/success-output-retention.js";
import { JobsStore } from "../src/stores/jobs-store.js";
import type { JobRecord } from "../src/types.js";
import { buildJobProgress } from "../src/utils/job-progress.js";
import { OUTPUTS_DIR, UPLOADS_DIR } from "../src/utils/paths.js";
import { resetTestStorage } from "./helpers.js";

function buildSuccessJob(
  jobId: string,
  overrides: Partial<JobRecord> & {
    output?: Partial<JobRecord["output"]>;
  } = {}
): JobRecord {
  const { output, ...jobOverrides } = overrides;
  const now = new Date().toISOString();
  return {
    jobId,
    createdAt: now,
    updatedAt: now,
    ownerUserId: "user-1",
    ownerEmail: "creator@test.dev",
    title: "Job",
    description: "Desc",
    contentType: "affiliate",
    voiceGender: "female",
    tone: "natural",
    videoPath: path.join(UPLOADS_DIR, jobId, "source.mp4"),
    videoMimeType: "video/mp4",
    videoDurationSec: 30,
    status: "success",
    progress: buildJobProgress("success"),
    output: {
      captionPath: `/outputs/${jobId}/caption.txt`,
      finalVideoPath: `/outputs/${jobId}/final.mp4`,
      artifactPaths: [`/outputs/${jobId}/caption.txt`, `/outputs/${jobId}/final.mp4`],
      updatedAt: now,
      ...output
    },
    ...jobOverrides
  };
}

async function seedArtifacts(jobId: string): Promise<void> {
  const outputDir = path.join(OUTPUTS_DIR, jobId);
  const uploadDir = path.join(UPLOADS_DIR, jobId);
  await mkdir(outputDir, { recursive: true });
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(outputDir, "caption.txt"), "caption", "utf8");
  await writeFile(path.join(outputDir, "final.mp4"), "video", "utf8");
  await writeFile(path.join(uploadDir, "source.mp4"), "source", "utf8");
}

describe("success output retention sweeper", () => {
  const jobsStore = new JobsStore();
  const logger = pino({ level: "silent" });

  beforeEach(async () => {
    await resetTestStorage();
  });

  it("removes expired success jobs that are still pending download", async () => {
    const oldTimestamp = "2026-05-01T00:00:00.000Z";
    const freshTimestamp = "2026-05-10T12:00:00.000Z";

    await jobsStore.create(
      buildSuccessJob("expired-success", {
        createdAt: oldTimestamp,
        updatedAt: oldTimestamp,
        output: {
          updatedAt: oldTimestamp
        }
      })
    );
    await jobsStore.create(
      buildSuccessJob("fresh-success", {
        createdAt: freshTimestamp,
        updatedAt: freshTimestamp,
        output: {
          updatedAt: freshTimestamp
        }
      })
    );
    await jobsStore.create(
      buildSuccessJob("fully-downloaded", {
        createdAt: oldTimestamp,
        updatedAt: oldTimestamp,
        output: {
          updatedAt: oldTimestamp,
          captionDownloadedAt: oldTimestamp,
          finalVideoDownloadedAt: oldTimestamp
        }
      })
    );
    await jobsStore.create(
      buildSuccessJob("failed-job", {
        createdAt: oldTimestamp,
        updatedAt: oldTimestamp,
        status: "failed",
        progress: buildJobProgress("failed"),
        output: {
          updatedAt: oldTimestamp
        }
      })
    );
    await jobsStore.create(
      buildSuccessJob("interrupted-job", {
        createdAt: oldTimestamp,
        updatedAt: oldTimestamp,
        status: "interrupted",
        progress: buildJobProgress("interrupted"),
        output: {
          updatedAt: oldTimestamp
        }
      })
    );

    await Promise.all([
      seedArtifacts("expired-success"),
      seedArtifacts("fresh-success"),
      seedArtifacts("fully-downloaded"),
      seedArtifacts("failed-job"),
      seedArtifacts("interrupted-job")
    ]);

    const sweeper = new SuccessOutputRetentionSweeper(jobsStore, logger, 72);
    const deletedCount = await sweeper.sweepOnce(Date.parse("2026-05-11T12:00:00.000Z"));

    expect(deletedCount).toBe(1);
    expect(await jobsStore.getById("expired-success")).toBeUndefined();
    expect(await jobsStore.getById("fresh-success")).toBeTruthy();
    expect(await jobsStore.getById("fully-downloaded")).toBeTruthy();
    expect(await jobsStore.getById("failed-job")).toBeTruthy();
    expect(await jobsStore.getById("interrupted-job")).toBeTruthy();
  });
});
