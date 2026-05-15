import express from "express";
import { isAuthenticated } from "../middlewares/authMiddleware.js";
import { isRecruiter } from "../middlewares/roleMiddleware.js";
import * as recruiterAppController from "../controllers/recruiterApplicationController.js";
import { isVerified } from "../middlewares/isVerifiedMiddleware.js";

const router = express.Router();

const guard = [isAuthenticated, isVerified, isRecruiter];

// ── Stats (must be before /:jobId to avoid wildcard capture) ──────────────────
router.get("/stats", ...guard, recruiterAppController.getApplicationStats);

// ── AI shortlist (must be before /:jobId for the same reason) ────────────────
router.get("/:jobId/ai-shortlisted", ...guard, recruiterAppController.getAIShortlistedApplications);

// ── All applications for a job ────────────────────────────────────────────────
router.get("/:jobId", ...guard, recruiterAppController.getApplicationsForJob);

// ── Update application status ─────────────────────────────────────────────────
router.patch("/:appId/:status", ...guard, recruiterAppController.updateApplicationStatus);
router.put("/:appId/:status", ...guard, recruiterAppController.updateApplicationStatus);

export default router;
