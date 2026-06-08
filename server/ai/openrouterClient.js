import dotenv from "dotenv";
import { z } from "zod";
import { analyzeResume } from "../services/resumeAnalysisClient.js";

dotenv.config();

const flexibleStringArray = z
    .array(z.any())
    .transform((arr) =>
        arr.map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object") {
                return item.name || item.title || item.project || item.description || JSON.stringify(item);
            }
            return String(item);
        }),
    )
    .default([]);

const ResumeSchema = z.object({
    skills: flexibleStringArray,
    projects: flexibleStringArray,
    missing_skills: flexibleStringArray,
    summary: z.string().default(""),
    ats_score: z.number().min(0).max(100).default(0),
    strengths: flexibleStringArray,
    weaknesses: flexibleStringArray,
    improvement_suggestions: flexibleStringArray,
    recommended_roles: flexibleStringArray,
    years_experience: z.any().transform(String).default(""),
    education: z.any().transform(String).default(""),
    soft_skills: flexibleStringArray,
});

const JobFitSchema = z.object({
    fit_score: z.number().min(0).max(100),
    explanation: z.string().default(""),
});

function toYearsString(months) {
    const safeMonths = Number.isFinite(months) ? months : 0;
    const years = safeMonths / 12;
    if (years <= 0) return "";
    return years < 1 ? `${years.toFixed(1)} years` : `${Math.round(years)} years`;
}

function formatEducation(education) {
    if (!Array.isArray(education) || education.length === 0) return "";
    const top = education[0] || {};
    const degree = top.degree || "";
    const institution = top.institution || "";
    const year = top.year || "";
    return [degree, institution, year].filter(Boolean).join(" | ");
}

export function mapAnalysisToResumeSummary(analysis) {
    const jd = analysis.jd_match_analysis || analysis.jd_comparison || {};
    const weaknesses = Array.isArray(analysis.issues_summary) ? analysis.issues_summary : [];
    const suggestions = Array.isArray(analysis.issues_summary) ? analysis.issues_summary : [];

    const projects = Array.isArray(analysis.projects) ? analysis.projects.map((proj) => proj?.title || proj?.name || proj?.description || JSON.stringify(proj)) : [];

    const mapped = {
        skills: analysis.skills || [],
        projects,
        missing_skills: jd.skills_gap || analysis.missing_keywords || [],
        summary: analysis.summary || analysis.interpretation || "",
        ats_score: Number.isFinite(analysis.ats_score) ? analysis.ats_score : 0,
        strengths: analysis.strengths || [],
        weaknesses,
        improvement_suggestions: suggestions,
        recommended_roles: analysis.recommended_roles || [],
        years_experience: toYearsString(analysis.experience_months),
        education: formatEducation(analysis.education),
        soft_skills: analysis.soft_skills || [],
    };

    return ResumeSchema.parse(mapped);
}

export async function analyzeResumeMistral(resumeText, jobGoal) {
    const analysis = await analyzeResume({
        resumeText,
        jobDescription: jobGoal || "",
    });

    return mapAnalysisToResumeSummary(analysis);
}

export async function analyzeCandidateJobFit(jobDescription, resumeText) {
    const analysis = await analyzeResume({
        resumeText,
        jobDescription: jobDescription || "",
    });

    const jd = analysis.jd_match_analysis || analysis.jd_comparison || {};
    const rawScore = Number(jd.match_percentage ?? analysis.keyword_match ?? 0);
    const fit_score = Math.max(0, Math.min(100, Math.round(rawScore)));

    const explanation = analysis.interpretation || "Resume analysis completed against the job description.";

    return JobFitSchema.parse({ fit_score, explanation });
}
