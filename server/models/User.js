import mongoose from "mongoose";
import Company from "./Company.js";
import Job from "./Job.js";
import Application from "./Application.js";

const userSchema = new mongoose.Schema(
    {
        username: { type: String },
        email: { type: String, required: true, unique: true },
        password: { type: String }, // only required for local auth
        provider: {
            type: String,
            enum: ["local", "google", "github"],
            default: "local",
        },
        googleId: { type: String },
        githubId: { type: String },
        image: { type: String }, // profile picture
        phone: { type: String },
        location: { type: String },
        resume: { type: String }, // for candidates and to see the preview of the resume
        resumePublicId: { type: String }, // For deleting purpose
        resumeFilename: { type: String }, // Original filename of the resume
        resumeText: String, // Parsed, plain text (to be cached) (for future ai use case)
        resumeTextHash: { type: String }, // Deterministic hash of resumeText for caching

        role: {
            type: String,
            enum: ["candidate", "recruiter", "admin"],
            default: null, // No default role - set during onboarding
        },

        companyName: { type: String }, // for recruiters
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" }, // future use

        isVerified: { type: Boolean, default: false },
        refreshToken: { type: String, default: null },
        summary: { type: String }, // Cached candidate summary as used by AI

        // Candidate profile sections
        about: { type: String }, // About/bio section

        skills: [
            {
                name: { type: String, required: true },
                level: {
                    type: String,
                    enum: ["beginner", "intermediate", "advanced", "expert"],
                    default: "intermediate",
                },
            },
        ],

        experience: [
            {
                company: { type: String, required: true },
                position: { type: String, required: true },
                startDate: { type: Date, required: true },
                endDate: { type: Date }, // null if current job
                isCurrent: { type: Boolean, default: false },
                description: { type: String },
                location: { type: String },
            },
        ],

        education: [
            {
                institution: { type: String, required: true },
                degree: { type: String, required: true },
                field: { type: String },
                startDate: { type: Date },
                endDate: { type: Date },
                gpa: { type: Number },
                description: { type: String },
            },
        ],

        projects: [
            {
                title: { type: String, required: true },
                description: { type: String },
                technologies: [{ type: String }],
                startDate: { type: Date },
                endDate: { type: Date },
                url: { type: String }, // project link
                githubUrl: { type: String },
            },
        ],

        certifications: [
            {
                name: { type: String, required: true },
                issuer: { type: String },
                dateIssued: { type: Date },
                expiryDate: { type: Date },
                credentialId: { type: String },
                url: { type: String },
            },
        ],

        otp: { type: String },
        otpExpires: { type: Date },
    },
    { timestamps: true },
);

// Cascade delete related data when a user is deleted
// Note: We only cascade for recruiters (companies, jobs, applications as recruiter)
userSchema.post("findOneAndDelete", async function (doc) {
    if (!doc) return;
    try {
        if (doc.role === "recruiter") {
            // Delete companies created by this recruiter
            const companies = await Company.find({ createdBy: doc._id }).select("_id");
            const companyIds = companies.map((c) => c._id);

            // Find jobs posted by this recruiter or under their companies
            const jobs = await Job.find({ $or: [{ recruiter: doc._id }, { company: { $in: companyIds } }] }).select("_id");
            const jobIds = jobs.map((j) => j._id);

            await Promise.all([Company.deleteMany({ createdBy: doc._id }), Job.deleteMany({ $or: [{ recruiter: doc._id }, { company: { $in: companyIds } }] }), Application.deleteMany({ $or: [{ recruiter: doc._id }, { job: { $in: jobIds } }] })]);
        }

        if (doc.role === "candidate") {
            // Delete applications by this candidate
            await Application.deleteMany({ candidate: doc._id });
        }
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Cascade delete failed for user:", doc._id, err?.message);
    }
});

// Support document deleteOne() cascades
userSchema.post("deleteOne", { document: true, query: false }, async function () {
    try {
        if (this.role === "recruiter") {
            const companies = await Company.find({ createdBy: this._id }).select("_id");
            const companyIds = companies.map((c) => c._id);
            const jobs = await Job.find({ $or: [{ recruiter: this._id }, { company: { $in: companyIds } }] }).select("_id");
            const jobIds = jobs.map((j) => j._id);
            await Promise.all([Company.deleteMany({ createdBy: this._id }), Job.deleteMany({ $or: [{ recruiter: this._id }, { company: { $in: companyIds } }] }), Application.deleteMany({ $or: [{ recruiter: this._id }, { job: { $in: jobIds } }] })]);
        }

        if (this.role === "candidate") {
            await Application.deleteMany({ candidate: this._id });
        }
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Cascade delete failed for user (doc.deleteOne):", this?._id, err?.message);
    }
});
const User = mongoose.model("User", userSchema);

export default User;
