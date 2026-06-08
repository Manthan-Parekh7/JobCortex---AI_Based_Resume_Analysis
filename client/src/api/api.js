// src/api/api.js
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true, // important: send HttpOnly cookies
    headers: { "Content-Type": "application/json" },
});

// Global response interceptor: unwrap message if backend sends { message }.
// Debug logging is restricted to DEV builds so PII never appears in production
// browser consoles.
api.interceptors.response.use(
    (res) => {
        if (import.meta.env.DEV) {
            console.debug("Axios [success]", res.config?.method?.toUpperCase(), res.config?.url, res.status);
        }
        return res;
    },
    (err) => {
        if (import.meta.env.DEV) {
            console.debug("Axios [error]", err.config?.method?.toUpperCase(), err.config?.url, err.response?.status);
        }
        const message = err.response?.data?.message || err.response?.statusText || err.message || "Network error";
        return Promise.reject({ success: false, message });
    },
);

// Helper functions (return res.data)
export const loginUser = (credentials) => api.post("/auth/login", credentials).then((r) => r.data);
export const signupUser = (data) => api.post("/auth/signup", data).then((r) => r.data);
export const verifyOtpApi = (data) => api.post("/auth/verify-otp", data).then((r) => r.data);
export const getMe = () => api.get("/auth/me").then((r) => r.data);
export const logoutUser = () => api.post("/auth/logout").then((r) => r.data);

// Candidate API calls
export const getJobs = (params) => api.get("/candidate/jobs", { params }).then((r) => r.data);
export const getJobDetails = (jobId) => api.get(`/candidate/jobs/${jobId}`).then((r) => r.data);
export const updateApplication = (appId, data) => api.put(`/candidate/applications/${appId}`, data).then((r) => r.data);
export const withdrawApplication = (appId) => api.put(`/candidate/applications/${appId}`, { status: "withdrawn" }).then((r) => r.data);
export const deleteApplication = (appId) => api.delete(`/candidate/applications/${appId}`).then((r) => r.data);

export const uploadResume = (file) => {
    const formData = new FormData();
    formData.append("resume", file);
    return api
        .post("/candidate/me/resume", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data);
};

export const analyzeResume = ({ jobDescription = "", forceRefresh = false }) => api.post("/candidate/me/parse-resume-cloudinary", { jobDescription, forceRefresh }, { timeout: 180000 }).then((r) => r.data);

export const generateResumePdf = (analysis) => api.post("/candidate/me/resume-analysis/pdf", { analysis }, { responseType: "blob", timeout: 180000 }).then((r) => r.data);

export default api;
