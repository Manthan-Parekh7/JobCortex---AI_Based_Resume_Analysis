import mongoose from "mongoose";
import Application from "./Application.js";

const jobSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true },
        responsibilities: { type: String },
        requirements: { type: String },
        salary: { type: String }, // could be a range or object, for now string
        location: { type: String },
        jobType: { type: String, enum: ["Full-time", "Part-time", "Contract", "Internship"], default: "Full-time" },
        status: { type: String, enum: ["active", "inactive"], default: "active" },
        isVisible: { type: Boolean, default: true },

        // Link to company & recruiter
        company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
        recruiter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true }
);

// ── Cascade deletes ───────────────────────────────────────────────────────────
// IMPORTANT: hooks MUST be registered on the schema BEFORE mongoose.model() is
// called. Registering them after model compilation is unreliable and may cause
// hooks to be silently skipped, leading to orphaned Application records.

// Triggered by Job.findOneAndDelete(...)
jobSchema.post("findOneAndDelete", async function (doc) {
    if (!doc) return;
    try {
        await Application.deleteMany({ job: doc._id });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Cascade delete applications failed for job:", doc._id, err?.message);
    }
});

// Triggered by jobDoc.deleteOne()
jobSchema.post("deleteOne", { document: true, query: false }, async function () {
    try {
        // `this` is the document
        await Application.deleteMany({ job: this._id });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Cascade delete applications failed for job (doc.deleteOne):", this?._id, err?.message);
    }
});

// ── Model compilation (must come AFTER all schema middleware) ─────────────────
const Job = mongoose.model("Job", jobSchema);
export default Job;
