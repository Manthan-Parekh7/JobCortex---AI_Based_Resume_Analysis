/**
 * consistencyJob.js — DB-level consistency / orphan cleanup
 *
 * Finds Application records whose `job` reference no longer exists in the
 * jobs collection (orphans created if cascade-delete hooks ever fail) and
 * removes them.
 *
 * Schedule: runs once on startup, then every CONSISTENCY_JOB_INTERVAL_HOURS
 * (default 24 h).  Set CONSISTENCY_JOB_INTERVAL_HOURS=0 in .env to disable.
 */

import Application from "../models/Application.js";
import Job from "../models/Job.js";
import logger from "../config/logger.js";

const INTERVAL_HOURS = Number(process.env.CONSISTENCY_JOB_INTERVAL_HOURS ?? 24);

/**
 * Runs a single pass of the orphan-cleanup query.
 * Returns the count of removed documents.
 */
export async function runOrphanCleanup() {
    try {
        logger.info("ConsistencyJob: starting orphan Application cleanup");

        // Collect all existing job IDs in one lightweight query
        const existingJobIds = await Job.distinct("_id");

        // Delete any Application whose job field is NOT in the existing set
        const result = await Application.deleteMany({
            job: { $nin: existingJobIds },
        });

        if (result.deletedCount > 0) {
            logger.warn(
                `ConsistencyJob: removed ${result.deletedCount} orphaned Application(s) with no matching Job`
            );
        } else {
            logger.info("ConsistencyJob: no orphaned Applications found");
        }

        return result.deletedCount;
    } catch (err) {
        logger.error(`ConsistencyJob: cleanup failed — ${err.message}`, { stack: err.stack });
        return 0;
    }
}

/**
 * Starts the scheduled consistency job.
 * Call once after the DB connection is established.
 */
export function startConsistencyJob() {
    if (INTERVAL_HOURS <= 0) {
        logger.info("ConsistencyJob: disabled (CONSISTENCY_JOB_INTERVAL_HOURS=0)");
        return;
    }

    // Run immediately on startup
    runOrphanCleanup();

    // Then schedule recurring runs
    const intervalMs = INTERVAL_HOURS * 60 * 60 * 1000;
    setInterval(runOrphanCleanup, intervalMs);

    logger.info(
        `ConsistencyJob: scheduled orphan cleanup every ${INTERVAL_HOURS}h (next run in ~${INTERVAL_HOURS}h)`
    );
}
