import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
    {
        job: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Job",
            required: true,
        },
        candidate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        recruiter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User", // The recruiter who posted the job
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "withdrawn"],
            default: "pending",
        },
        coverLetter: { type: String }, // Optional
        resume: { type: String }, // URL or path to uploaded resume (optional)
        aiShortlist: {
            fitScore: { type: Number },
            skillsMatchScore: { type: Number },
            overallScore: { type: Number },
            explanation: { type: String },
            status: { type: String },
            updatedAt: { type: Date },
            resumeTextHash: { type: String },
            jobHash: { type: String },
        },
        appliedAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

const Application = mongoose.model("Application", applicationSchema);
export default Application;
