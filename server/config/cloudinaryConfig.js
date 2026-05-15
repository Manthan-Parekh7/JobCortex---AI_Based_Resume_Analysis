import pkg from "cloudinary";
const { v2: cloudinary } = pkg;
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── File size constants ───────────────────────────────────────────────────────
const RESUME_MAX_SIZE_MB = Number(process.env.RESUME_MAX_SIZE_MB || 5);
const PROFILE_IMAGE_MAX_SIZE_MB = Number(process.env.PROFILE_IMAGE_MAX_SIZE_MB || 2);
const RESUME_MAX_BYTES = RESUME_MAX_SIZE_MB * 1024 * 1024;
const PROFILE_IMAGE_MAX_BYTES = PROFILE_IMAGE_MAX_SIZE_MB * 1024 * 1024;

// ── File type guards ──────────────────────────────────────────────────────────
const ALLOWED_RESUME_MIMES = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function resumeFileFilter(_req, file, cb) {
    if (ALLOWED_RESUME_MIMES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", `Only PDF, DOC, DOCX, or TXT files are allowed. Got: ${file.mimetype}`));
    }
}

function profileImageFileFilter(_req, file, cb) {
    if (ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", `Only JPEG, PNG, or WebP images are allowed. Got: ${file.mimetype}`));
    }
}

// ── Storage for Resumes ───────────────────────────────────────────────────────
const resumeStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "jobportal_resumes",
        resource_type: "raw",
        allowed_formats: ["pdf", "doc", "docx", "txt"],
        public_id: (req, file) => `resume-${req.user.id}-${Date.now()}`,
    },
});

export const uploadResume = multer({
    storage: resumeStorage,
    limits: {
        fileSize: RESUME_MAX_BYTES,   // default 5 MB
        files: 1,
    },
    fileFilter: resumeFileFilter,
});

// ── Storage for Profile Images ────────────────────────────────────────────────
const profileImageStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "jobportal_profile_images",
        resource_type: "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        public_id: (req, file) => `profile-${req.user.id}-${Date.now()}`,
    },
});

export const uploadProfileImage = multer({
    storage: profileImageStorage,
    limits: {
        fileSize: PROFILE_IMAGE_MAX_BYTES,  // default 2 MB
        files: 1,
    },
    fileFilter: profileImageFileFilter,
});

export { cloudinary };
