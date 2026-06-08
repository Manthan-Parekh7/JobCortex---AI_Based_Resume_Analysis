import axios from "axios";

const SERVICE_URL = process.env.RESUME_ANALYSIS_SERVICE_URL || "http://localhost:8001";
const SERVICE_KEY = process.env.RESUME_ANALYSIS_SERVICE_KEY || "";

function buildHeaders() {
    if (!SERVICE_KEY) {
        throw new Error("RESUME_ANALYSIS_SERVICE_KEY is not configured");
    }
    return {
        "X-Internal-Service-Key": SERVICE_KEY,
        "Content-Type": "application/json",
    };
}

export async function analyzeResume({ resumeText, jobDescription = "" }) {
    if (!resumeText || !resumeText.trim()) {
        throw new Error("resumeText is required to analyze a resume");
    }

    const response = await axios.post(
        `${SERVICE_URL}/api/v1/analyze-resume`,
        {
            resume_text: resumeText,
            job_description: jobDescription,
        },
        { headers: buildHeaders(), timeout: 180000 },
    );

    return response.data;
}

export async function generateResumePdf(analysis) {
    if (!analysis) {
        throw new Error("analysis payload is required to generate a PDF");
    }

    const response = await axios.post(`${SERVICE_URL}/api/v1/generate-pdf`, analysis, {
        headers: buildHeaders(),
        responseType: "arraybuffer",
        timeout: 180000,
    });

    return response.data;
}
