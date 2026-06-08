import mongoose from "mongoose";

const resumeAnalysisSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        resumeTextHash: { type: String, required: true, index: true },
        jobHash: { type: String, default: null, index: true },
        analysisResult: { type: mongoose.Schema.Types.Mixed, required: true },
    },
    { timestamps: true },
);

resumeAnalysisSchema.index({ user: 1, resumeTextHash: 1, jobHash: 1 }, { unique: true });

const ResumeAnalysis = mongoose.model("ResumeAnalysis", resumeAnalysisSchema);

export default ResumeAnalysis;
