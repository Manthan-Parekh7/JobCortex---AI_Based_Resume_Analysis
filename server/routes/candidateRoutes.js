import express from "express";
import { listJobs, getJobDetails, applyToJob, updateApplication, deleteApplication, myApplications, uploadOrReplaceResume, getResume, deleteResume, updateUserProfile, parseResumeFromCloudinary, generateResumePdf } from "../controllers/candidateController.js";
import { isAuthenticated } from "../middlewares/authMiddleware.js";
import { uploadResume, uploadProfileImage } from "../config/cloudinaryConfig.js";

const router = express.Router();

// Public routes
router.get("/jobs", listJobs);
router.get("/jobs/:jobId", getJobDetails);

// Protected routes (Candidate)
router.use(isAuthenticated); // All routes below this are protected

router.post("/jobs/:jobId/apply", uploadResume.single("resume"), applyToJob); // This is the route for applyToJob
router.put("/applications/:appId", uploadResume.single("resume"), updateApplication);
router.delete("/applications/:appId", deleteApplication);
router.get("/applications/me", myApplications);

// Resume management
router.post("/me/resume", uploadResume.single("resume"), uploadOrReplaceResume); // This route uses multer
router.get("/me/resume", getResume);
router.delete("/me/resume", deleteResume);

// Profile management
router.put("/me/profile", uploadProfileImage.single("profileImage"), updateUserProfile); // This route uses multer

router.post("/me/parse-resume-cloudinary", parseResumeFromCloudinary);
router.post("/me/resume-analysis/pdf", generateResumePdf);

export default router;
