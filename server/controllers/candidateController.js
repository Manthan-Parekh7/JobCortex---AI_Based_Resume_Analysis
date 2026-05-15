import Job from "../models/Job.js";
import Company from "../models/Company.js";
import Application from "../models/Application.js";
import logger from "../config/logger.js";
import User from "../models/User.js";
import pkg from "cloudinary";
const { v2: cloudinary } = pkg;

// AI/Parsing Helpers
import { getOrParseResumeText } from "../utils/getOrParseResumeText.js";
import { analyzeResumeMistral } from "../ai/openrouterClient.js";

// ── Utility: safe JSON array field parser ─────────────────────────────────────
/**
 * Parses a JSON string that is expected to be an array.
 * Returns `undefined` when the value is not provided so callers can skip
 * the field update gracefully.
 * Throws a descriptive Error (caught and converted to 400) on bad input.
 */
function parseArrayField(fieldValue, fieldName) {
    if (fieldValue === undefined || fieldValue === null) return undefined;
    let parsed;
    try {
        parsed = typeof fieldValue === "string" ? JSON.parse(fieldValue) : fieldValue;
    } catch {
        throw new Error(`${fieldName} must be valid JSON`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error(`${fieldName} must be an array`);
    }
    return parsed;
}


// Get all active jobs (public)
export const listJobs = async (req, res) => {
    try {
        const { search, location, page = 1, limit = 10 } = req.query;
        const filter = { status: "active", isVisible: true };

        if (search) filter.title = { $regex: search, $options: "i" };
        if (location) filter.location = { $regex: location, $options: "i" };

        const jobs = await Job.find(filter)
            .populate("company", "name logo industry")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        // Add application count and hasApplied status to each job
        const jobsWithMetadata = await Promise.all(
            jobs.map(async (job) => {
                const applicationCount = await Application.countDocuments({ job: job._id });

                let hasApplied = false;
                if (req.user && req.user.role === "candidate") {
                    const existingApplication = await Application.findOne({
                        job: job._id,
                        candidate: req.user._id,
                    });
                    hasApplied = !!existingApplication;
                }

                return {
                    ...job.toObject(),
                    applicationCount,
                    hasApplied,
                };
            })
        );

        const total = await Job.countDocuments(filter);

        logger.info(`Fetched jobs list (page: ${page}, limit: ${limit}, search: ${search || "none"}, location: ${location || "none"})`);

        return res.json({
            success: true,
            message: "Jobs fetched successfully",
            jobs: jobsWithMetadata,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalJobs: total,
        });
    } catch (err) {
        logger.error("Error fetching jobs:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch jobs" });
    }
};

// Get single job by ID (public)
export const getJobDetails = async (req, res) => {
    try {
        const job = await Job.findOne({
            _id: req.params.jobId,
            status: "active",
            isVisible: true,
        }).populate("company", "name logo description website industry size");

        if (!job) {
            logger.warn(`Job not found: ID ${req.params.jobId}`);
            return res.status(404).json({ success: false, message: "Job not found" });
        }

        // Count total applications for this job
        const applicationCount = await Application.countDocuments({ job: req.params.jobId });

        // Check if current user has applied to this job (if user is logged in)
        let hasApplied = false;
        if (req.user && req.user.role === "candidate") {
            const existingApplication = await Application.findOne({
                job: req.params.jobId,
                candidate: req.user._id,
            });
            hasApplied = !!existingApplication;
        }

        const jobWithMetadata = {
            ...job.toObject(),
            applicationCount,
            hasApplied,
        };

        logger.info(`Fetched job details for job ID ${req.params.jobId}`);
        return res.json({ success: true, message: "Job details fetched successfully", job: jobWithMetadata });
    } catch (err) {
        logger.error("Error fetching job details:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch job details" });
    }
};

// Apply to a job (logged-in candidate, uses existing resume)
export const applyToJob = async (req, res) => {
    try {
        if (req.user.role !== "candidate") {
            logger.warn(`User ${req.user.email} (role: ${req.user.role}) tried to apply but is not a candidate`);
            return res.status(403).json({ success: false, message: "Only candidates can apply" });
        }

        const { coverLetter } = req.body;
        const jobId = req.params.jobId;

        const job = await Job.findOne({
            _id: jobId,
            status: "active",
            isVisible: true,
        });

        if (!job) {
            logger.warn(`Job not found or not open for application: ID ${jobId}`);
            return res.status(404).json({ success: false, message: "Job not found or not open" });
        }

        const existing = await Application.findOne({
            job: job._id,
            candidate: req.user._id,
        });

        if (existing) {
            logger.warn(`User ${req.user.email} has already applied to job ID ${jobId}`);
            return res.status(400).json({ success: false, message: "You have already applied to this job" });
        }

        let resumeUrl = req.user.resume; // Default to profile resume
        let resumePublicId = req.user.resumePublicId; // Default to profile resume public ID

        // If a new resume file is uploaded for this specific application
        if (req.file) {
            // Upload the new resume to Cloudinary
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: "jobportal_resumes",
                resource_type: "raw",
            });
            resumeUrl = result.secure_url;
            resumePublicId = result.public_id;
        } else if (!req.user.resume) {
            // If no new resume is uploaded and no profile resume exists
            logger.warn(`User ${req.user.email} has no resume uploaded yet and did not provide one for application`);
            return res.status(400).json({ success: false, message: "Please upload your resume before applying or provide one for this application." });
        }

        const app = await Application.create({
            job: job._id,
            candidate: req.user._id,
            recruiter: job.recruiter,
            coverLetter: coverLetter || "",
            resume: resumeUrl,
            resumePublicId: resumePublicId, // Store the public ID if a new resume was uploaded
        });

        logger.info(`User ${req.user.email} applied to job ID ${jobId} successfully`);
        return res.status(201).json({ success: true, message: "Application submitted successfully", application: app });
    } catch (err) {
        logger.error("Apply error:", err);
        return res.status(500).json({ success: false, message: "Failed to apply" });
    }
};

// Update an existing application
export const updateApplication = async (req, res) => {
    try {
        if (req.user.role !== "candidate") {
            logger.warn(`User ${req.user.email} tried to update application but is not a candidate`);
            return res.status(403).json({ success: false, message: "Only candidates can update applications" });
        }

        const { appId } = req.params;
        const { coverLetter, status } = req.body;

        logger.info(`Attempting to update application ${appId} for user ${req.user._id}`);

        const app = await Application.findOne({
            _id: appId,
            candidate: req.user._id,
        });

        if (!app) {
            logger.warn(`Application not found for update: ID ${appId}`);
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        // Handle status change (e.g., withdrawal)
        if (status) {
            if (status === "withdrawn") {
                if (app.status === "withdrawn") {
                    logger.warn(`Application ID ${appId} already withdrawn`);
                    return res.status(400).json({ success: false, message: "Application already withdrawn" });
                }
                app.status = "withdrawn";
                await app.save();
                logger.info(`User ${req.user.email} withdrew application ID ${appId}`);
                return res.json({
                    success: true,
                    message: "Application withdrawn successfully",
                    application: app,
                });
            } else {
                // Candidates should only be able to withdraw, not change to other statuses.
                return res.status(400).json({ success: false, message: "Invalid status update" });
            }
        }

        // Handle cover letter update
        if (coverLetter) {
            app.coverLetter = coverLetter;
        }

        // Handle new resume upload
        if (req.file) {
            // If there was a resume specific to this application, delete it.
            // Note: This assumes resumes uploaded per-application are not shared.
            if (app.resumePublicId) {
                await cloudinary.uploader.destroy(app.resumePublicId, {
                    resource_type: "raw",
                });
            }

            // Upload the new resume to Cloudinary
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: "jobportal_resumes",
                resource_type: "raw",
            });
            app.resume = result.secure_url;
            app.resumePublicId = result.public_id;
        }

        await app.save();

        logger.info(`User ${req.user.email} updated application ID ${appId}`);
        return res.json({
            success: true,
            message: "Application updated successfully",
            application: app,
        });
    } catch (err) {
        logger.error("Update application error:", err);
        return res.status(500).json({ success: false, message: "Failed to update application" });
    }
};

export const deleteApplication = async (req, res) => {
    try {
        if (req.user.role !== "candidate") {
            logger.warn(`User ${req.user.email} tried to delete application but is not a candidate`);
            return res.status(403).json({ success: false, message: "Only candidates can delete applications" });
        }

        const { appId } = req.params;

        const app = await Application.findOne({
            _id: appId,
            candidate: req.user._id,
        });

        if (!app) {
            logger.warn(`Application not found for deletion: ID ${appId}`);
            return res.status(404).json({ success: false, message: "Application not found" });
        }

        if (app.status !== "withdrawn") {
            logger.warn(`User ${req.user.email} tried to delete an application that is not withdrawn: ID ${appId}`);
            return res.status(400).json({ success: false, message: "Only withdrawn applications can be deleted" });
        }

        await Application.findByIdAndDelete(appId);

        logger.info(`User ${req.user.email} deleted application ID ${appId}`);
        return res.json({ success: true, message: "Application deleted successfully" });
    } catch (err) {
        logger.error("Delete application error:", err);
        return res.status(500).json({ success: false, message: "Failed to delete application" });
    }
};

// View all applications for logged-in candidate
export const myApplications = async (req, res) => {
    try {
        if (req.user.role !== "candidate") {
            logger.warn(`User ${req.user.email} attempted to view applications but is not a candidate`);
            return res.status(403).json({ success: false, message: "Only candidates can view applications" });
        }

        const apps = await Application.find({ candidate: req.user._id })
            .populate({
                path: "job",
                select: "title company status",
                populate: {
                    path: "company",
                    select: "name",
                },
            })
            .populate("recruiter", "username email");

        logger.info(`Fetched all applications for user ${req.user.email}`);
        return res.json({ success: true, message: "Applications fetched successfully", applications: apps });
    } catch (err) {
        logger.error("Failed to fetch applications:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch applications" });
    }
};

// Upload or replace resume for logged-in candidate
export const uploadOrReplaceResume = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No resume file uploaded" });

        const user = await User.findById(req.user._id);

        // If a resume already exists, delete it from Cloudinary
        if (user.resumePublicId) {
            await cloudinary.uploader.destroy(user.resumePublicId, {
                resource_type: "raw",
            });
        }

        // Save new resume URL and publicId for Cloudinary deletion later
        user.resume = req.file.path; // Cloudinary URL
        user.resumePublicId = req.file.filename; // Cloudinary public_id
        user.resumeFilename = req.file.originalname; // Original filename
        await user.save();

        logger.info(`Resume uploaded for user ${req.user.email}`);
        res.json({
            success: true,
            message: "Resume uploaded successfully",
            resume: user.resume,
        });
    } catch (err) {
        logger.error("Resume upload error:", err);
        res.status(500).json({ success: false, message: "Failed to upload resume" });
    }
};

// Get current resume for logged-in candidate
export const getResume = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("resume");
        if (!user.resume) return res.status(404).json({ success: false, message: "No resume uploaded" });
        res.json({ success: true, message: "Resume fetched successfully", resume: user.resume });
    } catch (err) {
        logger.error("Get resume error:", err);
        res.status(500).json({ success: false, message: "Failed to get resume" });
    }
};

export const deleteResume = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user.resumePublicId) {
            return res.status(404).json({ success: false, message: "No resume to delete" });
        }

        // Delete from Cloudinary; specify resource_type for raw files
        const deleteResult = await cloudinary.uploader.destroy(user.resumePublicId, {
            resource_type: "raw",
        });

        if (deleteResult.result !== "ok") {
            logger.warn(`Cloudinary deletion failed for ${user.resumePublicId}: ${deleteResult.result}`);
            return res.status(500).json({ success: false, message: "Failed to delete resume from cloud storage" });
        }

        // Remove from the user document
        user.resume = undefined;
        user.resumePublicId = undefined;
        user.resumeText = undefined;
        user.summary = undefined; // delete cached AI summary
        await user.save();

        logger.info(`Resume deleted for user ${req.user.email}`);
        res.json({ success: true, message: "Resume deleted successfully" });
    } catch (err) {
        logger.error("Delete resume error:", err);
        res.status(500).json({ success: false, message: "Failed to delete resume" });
    }
};

// --------- AI Resume Parsing Endpoint ---------

export const updateUserProfile = async (req, res) => {
    try {
        const { username, about, phone, location, skills, experience, education, projects, certifications } = req.body;

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Update text fields
        if (username) user.username = username;
        if (about !== undefined) user.about = about;
        if (phone !== undefined) user.phone = phone;
        if (location !== undefined) user.location = location;

        // Update arrays (replace entire array) — safe parse with field validation
        try {
            const parsedSkills = parseArrayField(skills, "skills");
            if (parsedSkills !== undefined) user.skills = parsedSkills;

            const parsedExperience = parseArrayField(experience, "experience");
            if (parsedExperience !== undefined) user.experience = parsedExperience;

            const parsedEducation = parseArrayField(education, "education");
            if (parsedEducation !== undefined) user.education = parsedEducation;

            const parsedProjects = parseArrayField(projects, "projects");
            if (parsedProjects !== undefined) user.projects = parsedProjects;

            const parsedCertifications = parseArrayField(certifications, "certifications");
            if (parsedCertifications !== undefined) user.certifications = parsedCertifications;
        } catch (parseErr) {
            return res.status(400).json({ success: false, message: parseErr.message });
        }

        // Handle profile image upload
        if (req.file) {
            // If there's an old image, delete it from Cloudinary
            if (user.image) {
                const publicId = user.image.split("/").pop().split(".")[0];
                await cloudinary.uploader.destroy(publicId);
            }
            user.image = req.file.path; // Save new image URL
        }

        await user.save();

        logger.info(`User profile updated for ${req.user.email}`);
        res.json({
            success: true,
            message: "Profile updated successfully",
            user,
        });
    } catch (err) {
        logger.error("Update profile error:", err);
        res.status(500).json({ success: false, message: "Failed to update profile" });
    }
};

export const parseResumeFromCloudinary = async (req, res) => {
    try {
        // Get cached or parsed resume text
        const resumeText = await getOrParseResumeText(req.user._id);

        const jobGoal = req.body?.jobGoal || "";

        // analyzeResumeMistral now returns a validated, parsed object (via Zod)
        // No secondary JSON.parse or markdown stripping needed here.
        const parsedOutput = await analyzeResumeMistral(resumeText, jobGoal);

        // Cache the summary field on the user document
        const summary = parsedOutput.summary || "";
        await User.findByIdAndUpdate(req.user._id, { $set: { summary } });

        return res.json({ success: true, message: "Resume parsed successfully", ai_output: parsedOutput });
    } catch (err) {
        logger.error(`parseResumeFromCloudinary error for userId=${req.user._id}: ${err.message}`);
        return res.status(500).json({ success: false, message: err.message });
    }
};
