import Application from "../models/Application.js";
import Job from "../models/Job.js";
import User from "../models/User.js";
import Company from "../models/Company.js";
import logger from "../config/logger.js";
import { analyzeCandidateJobFit, analyzeResumeMistral } from "../ai/openrouterClient.js";
import { scheduleApplicationStatusEmail } from "../utils/emailService.js";

// View applications for a specific job
export const getApplicationsForJob = async (req, res) => {
    try {
        logger.info(`Attempting to fetch applications for job ID: ${req.params.jobId}, User: ${req.user.email}, User ID: ${req.user._id}`);

        // First check if the job exists at all
        const jobExists = await Job.findById(req.params.jobId);
        if (!jobExists) {
            logger.warn(`Job with ID ${req.params.jobId} does not exist in database`);
            return res.status(404).json({ success: false, message: "Job not found" });
        }

        logger.info(`Job exists. Job recruiter: ${jobExists.recruiter}, Current user: ${req.user._id}`);

        // Now check if it belongs to the current user
        const job = await Job.findOne({ _id: req.params.jobId, recruiter: req.user._id });
        if (!job) {
            logger.warn(`Job ${req.params.jobId} exists but is not owned by user ${req.user.email} (${req.user._id})`);
            return res.status(403).json({ success: false, message: "You don't have permission to view applications for this job" });
        }

        const applications = await Application.find({ job: req.params.jobId }).populate("candidate", "username email resume image");

        logger.info(`Fetched ${applications.length} applications for job ID ${req.params.jobId} by recruiter ${req.user.email}`);
        return res.json({ success: true, applications, job });
    } catch (err) {
        logger.error("Failed to fetch applications for job:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch applications" });
    }
};

// Update application status
export const updateApplicationStatus = async (req, res) => {
    try {
        const { appId, status } = req.params;
        const { interviewDetails, feedback } = req.body; // Optional details from recruiter

        if (!["accepted", "rejected", "pending"].includes(status)) {
            logger.warn(`Invalid status '${status}' attempted by user ${req.user.email} on application ${appId}`);
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        // Populate application with candidate and job details for email
        const app = await Application.findById(appId).populate("candidate", "username email").populate("job", "title").populate("recruiter", "companyId");

        if (!app) {
            logger.warn(`Application not found: ID ${appId}`);
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        // Ensure the recruiter owns this job
        if (app.recruiter._id.toString() !== req.user._id.toString()) {
            logger.warn(`User ${req.user.email} not authorized to update application ${appId}`);
            return res.status(403).json({ success: false, message: "Not authorized to update this application" });
        }

        // Get company details for email
        const company = await Company.findById(app.recruiter.companyId);
        const companyName = company ? company.name : "the company";

        // Store previous status to check if it actually changed
        const previousStatus = app.status;

        // Update application status
        app.status = status;
        app.updatedAt = new Date();
        await app.save();

        // Send email notification only if status actually changed and it's not pending
        if (previousStatus !== status && (status === "accepted" || status === "rejected")) {
            if (app.candidate && app.candidate.email) {
                const candidateEmail = app.candidate.email;
                const candidateName = app.candidate.username;
                const jobTitle = app.job?.title || "a job";

                // Schedule email with 30-second delay
                const emailDetails = status === "accepted" ? interviewDetails : feedback;
                scheduleApplicationStatusEmail(
                    candidateEmail,
                    candidateName,
                    jobTitle,
                    companyName,
                    status,
                    emailDetails,
                    30000 // 30 seconds delay
                );

                logger.info(`Scheduled ${status} email for candidate ${candidateEmail} after 30 seconds`);
            } else {
                logger.warn(`Could not send ${status} email for app ${appId}: Candidate email missing.`);
            }
        }

        logger.info(`Application ${appId} status updated to '${status}' by user ${req.user.email}`);
        return res.json({
            success: true,
            message: `Application ${status} successfully. ${status !== "pending" ? "Candidate will be notified via email in 30 seconds." : ""}`,
            application: app,
        });
    } catch (err) {
        logger.error("Update application status error:", err);
        return res.status(500).json({ success: false, message: "Failed to update application status" });
    }
};

// ── AI-powered shortlist ──────────────────────────────────────────────────────
// Multi-criteria scoring per candidate:
//   • skills_match — % of job keywords found in candidate skills (deterministic, 0-100)
//   • fit_score    — LLM job-fit vs job description (0-100)
//   • overall_score — weighted blend: 70% fit_score + 30% skills_match
export const getAIShortlistedApplications = async (req, res) => {
    try {
        const job = await Job.findOne({ _id: req.params.jobId, recruiter: req.user._id });
        if (!job) {
            return res.status(404).json({ success: false, message: "Job not found or not yours" });
        }

        // Populate full profile so UI can display rich candidate cards
        const applications = await Application.find({ job: req.params.jobId }).populate(
            "candidate",
            "username email image resumeText summary skills experience education projects location"
        );

        if (applications.length === 0) {
            return res.json({ success: true, applications: [], job, meta: { total: 0, scored: 0 } });
        }

        // Build keyword set from job text for deterministic skills-match (no LLM needed)
        const jobKeywords = extractJobKeywords(`${job.title} ${job.description} ${job.requirements || ""}`);

        const enhancedApplications = await Promise.all(
            applications.map(async (app) => {
                const candidate = app.candidate;
                
                if (!candidate) {
                    logger.warn(`Application ${app._id} has a null candidate (user deleted). Skipping AI scoring.`);
                    return {
                        ...app.toObject(),
                        fit_score: null,
                        fit_explanation: "Candidate account has been deleted.",
                        skills_match_score: 0,
                        overall_score: null,
                        summary: "",
                        scoring_status: "deleted_user",
                        rank: null,
                    };
                }

                const base = {
                    ...app.toObject(),
                    fit_score: null,
                    fit_explanation: "",
                    skills_match_score: null,
                    overall_score: null,
                    summary: candidate?.summary || "",
                    scoring_status: "pending",
                    rank: null,
                };

                try {
                    // ── Deterministic: skills-match ───────────────────────────────
                    const candidateSkills = (candidate?.skills || [])
                        .map((s) => (typeof s === "string" ? s : s?.name || "").toLowerCase())
                        .filter(Boolean);

                    const skillsMatch = jobKeywords.length > 0
                        ? Math.round(
                            (candidateSkills.filter((sk) =>
                                jobKeywords.some((kw) => sk.includes(kw) || kw.includes(sk))
                            ).length / jobKeywords.length) * 100
                        )
                        : 0;

                    // ── LLM: resume-fit ───────────────────────────────────────────
                    if (!candidate?.resumeText) {
                        logger.warn(`No resumeText for candidate ${candidate?._id}`);
                        const overall = Math.round(skillsMatch * 0.3);
                        return {
                            ...base,
                            skills_match_score: skillsMatch,
                            overall_score: overall,
                            scoring_status: "no_resume",
                            fit_explanation: "Candidate has not yet parsed their resume — score based on skills only.",
                        };
                    }

                    // Generate or use cached AI summary
                    let summary = candidate.summary;
                    if (!summary) {
                        const parsed = await analyzeResumeMistral(candidate.resumeText, job.title);
                        summary = parsed.summary || "";
                        await User.findByIdAndUpdate(candidate._id, { $set: { summary } });
                    }

                    // LLM job-fit
                    const fitData = await analyzeCandidateJobFit(job.description, summary);
                    const fitScore = fitData.fit_score;
                    const overall = Math.round(fitScore * 0.7 + skillsMatch * 0.3);

                    return {
                        ...base,
                        fit_score: fitScore,
                        fit_explanation: fitData.explanation,
                        skills_match_score: skillsMatch,
                        overall_score: overall,
                        summary,
                        scoring_status: "scored",
                    };
                } catch (err) {
                    logger.error(`AI scoring failed for application ${app._id}: ${err.message}`);
                    return {
                        ...base,
                        scoring_status: "ai_error",
                        fit_explanation: "AI scoring temporarily unavailable for this candidate.",
                    };
                }
            })
        );

        // Sort: overall_score desc, fit_score desc as tiebreaker, nulls last
        enhancedApplications.sort((a, b) => {
            const sa = a.overall_score ?? -1;
            const sb = b.overall_score ?? -1;
            if (sb !== sa) return sb - sa;
            return (b.fit_score ?? -1) - (a.fit_score ?? -1);
        });

        // Attach rank (1-based)
        enhancedApplications.forEach((app, i) => { app.rank = i + 1; });

        const scored = enhancedApplications.filter((a) => a.scoring_status === "scored").length;
        logger.info(`AI shortlist for job ${req.params.jobId}: ${scored}/${applications.length} fully scored`);

        return res.json({
            success: true,
            applications: enhancedApplications,
            job,
            meta: { total: applications.length, scored },
        });
    } catch (err) {
        logger.error("Failed to fetch AI shortlisted applications:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch AI shortlisted applications" });
    }
};

/**
 * Extracts meaningful lowercase keyword tokens from job text.
 * Used for deterministic skills-match scoring (zero LLM calls).
 */
function extractJobKeywords(text) {
    const STOP = new Set([
        "the","and","for","with","that","this","are","have","will","from","your",
        "our","you","not","but","can","all","any","its","their","about","more",
        "also","than","into","such","been","has","was","were","they","what","when",
        "who","how","may","must","should","would","could","very","well","work","team",
        "role","job","candidate","experience","required","strong","good","skills",
    ]);
    return [
        ...new Set(
            text
                .toLowerCase()
                .replace(/[^a-z0-9#+.\s-]/g, " ")
                .split(/\s+/)
                .filter((w) => w.length > 2 && !STOP.has(w))
        ),
    ].slice(0, 60); // cap at 60 tokens
}


// Get application statistics for recruiter
export const getApplicationStats = async (req, res) => {
    try {
        // Get all jobs for the recruiter
        const recruiterJobs = await Job.find({ recruiter: req.user._id }).select("_id");
        const jobIds = recruiterJobs.map((job) => job._id);

        // Get application counts by status
        const [totalApplications, pendingApplications, acceptedApplications, rejectedApplications] = await Promise.all([Application.countDocuments({ job: { $in: jobIds } }), Application.countDocuments({ job: { $in: jobIds }, status: "pending" }), Application.countDocuments({ job: { $in: jobIds }, status: "accepted" }), Application.countDocuments({ job: { $in: jobIds }, status: "rejected" })]);

        logger.info(`Application stats for recruiter ${req.user.email}: Total: ${totalApplications}, Pending: ${pendingApplications}, Accepted: ${acceptedApplications}, Rejected: ${rejectedApplications}`);

        return res.json({
            success: true,
            stats: {
                totalApplications,
                pendingApplications,
                acceptedApplications,
                rejectedApplications,
            },
        });
    } catch (err) {
        logger.error("Failed to fetch application stats:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch application statistics" });
    }
};
