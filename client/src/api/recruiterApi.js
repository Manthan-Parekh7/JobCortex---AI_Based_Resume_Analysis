import api from "./api";

// Job related API calls
export const addNewJob = async (jobData) => {
    const response = await api.post("/jobs", jobData);
    return response.data;
};

export const getMyJobs = async () => {
    const response = await api.get("/jobs/my");
    return response.data.jobs; // Extract jobs array from the response
};

export const deleteJob = async (jobId) => {
    const response = await api.delete(`/jobs/${jobId}`);
    return response.data;
};

export const updateHiringStatus = async (jobId, status) => {
    const response = await api.put(`/jobs/${jobId}/status`, { status });
    return response.data;
};

// Company related API calls (align with backend /company routes and JSON body)
export const addNewCompany = async (companyData) => {
    const response = await api.post("/company", companyData);
    return response.data; // { success, message, company }
};

// Create or update company profile (upsert)
export const createOrUpdateCompanyProfile = async (companyData) => {
    const response = await api.post("/company/profile", companyData);
    return response.data; // { success, message, company }
};

export const getMyCompany = async () => {
    const response = await api.get("/company/me");
    return response.data.company; // return the company object directly
};

export const updateCompany = async (companyData) => {
    const response = await api.put("/company/me", companyData);
    return response.data; // { success, message, company }
};

// Application related API calls
export const getApplicationsForJob = async (jobId) => {
    const response = await api.get(`/recruiter/applications/${jobId}`);
    return response.data; // Return full response data including applications array
};

export const updateApplicationStatus = async (appId, status, details = null) => {
    const requestBody = details ? details : {};
    const response = await api.put(`/recruiter/applications/${appId}/${status}`, requestBody);
    return response.data;
};

// Simple status update without details (for backward compatibility)
export const updateApplicationStatusSimple = async (appId, status) => {
    const response = await api.patch(`/recruiter/applications/${appId}/${status}`);
    return response.data;
};

export const getAIShortlistedApplications = async (jobId, forceRefresh = false) => {
    const params = forceRefresh ? { forceRefresh: true } : undefined;
    const response = await api.get(`/recruiter/applications/${jobId}/ai-shortlisted`, { params });
    return response.data;
};

export const getApplicationStats = async () => {
    const response = await api.get(`/recruiter/applications/stats`);
    return response.data.stats;
};

// Candidates (recruiter)
export const getAppliedCandidates = async () => {
    const response = await api.get(`/recruiter/candidates/applied`);
    return response.data.candidates;
};

export const searchCandidatesApi = async ({ q = "", skills = "", page = 1, limit = 12 }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (skills) params.set("skills", skills);
    params.set("page", String(page));
    params.set("limit", String(limit));
    const response = await api.get(`/recruiter/candidates/search?${params.toString()}`);
    return response.data; // { candidates, page, totalPages, total }
};

// Recruiter Profile API calls
export const getRecruiterProfile = async () => {
    const response = await api.get("/recruiter/me/profile");
    return response.data; // { success, message, user }
};

export const updateRecruiterProfile = async (profileData) => {
    const response = await api.put("/recruiter/me/profile", profileData);
    return response.data; // { success, message, user }
};
