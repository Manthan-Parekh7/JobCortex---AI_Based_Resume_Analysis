import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/connection.js";
import passport from "./utils/passport.js";
import authRoutes from "./routes/authRoutes.js";
import { isAuthenticated } from "./middlewares/authMiddleware.js";
import companyRoutes from "./routes/companyRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import candidateRoutes from "./routes/candidateRoutes.js";
import recruiterApplicationRoutes from "./routes/recruiterApplicationRoutes.js";
import recruiterProfileRoutes from "./routes/recruiterProfileRoutes.js";
import recruiterCandidateRoutes from "./routes/recruiterCandidateRoutes.js";
import logger from "./config/logger.js";
import { startConsistencyJob } from "./services/consistencyJob.js";
import multer from "multer";

dotenv.config();

// Connect to MongoDB, then start background jobs
connectDB().then(() => {
    startConsistencyJob();
}).catch((err) => {
    logger.error(`DB connection failed: ${err.message}`);
    process.exit(1);
});

const app = express();
const isProd = process.env.NODE_ENV === "production";

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// CORS config for both dev & prod
app.use(
    cors({
        origin: isProd ? process.env.CLIENT_URL : "http://localhost:5173",
        credentials: true,
    })
);

// Initialize passport
app.use(passport.initialize());

// Routes
app.use("/auth", authRoutes);
app.use("/company", companyRoutes);
app.use("/jobs", jobRoutes);
app.use("/candidate", candidateRoutes);
app.use("/recruiter/applications", recruiterApplicationRoutes);
app.use("/recruiter", recruiterProfileRoutes);
app.use("/recruiter/candidates", recruiterCandidateRoutes);

app.get("/health", (req, res) => {
    logger.info("Health check OK");
    res.status(200).json({ status: "OK" });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
});

// ── Structured error boundary ─────────────────────────────────────────────────
// Rules:
//  1. Multer file-size / type errors → 400 with a safe, user-facing message.
//  2. All other errors → 500 with a generic public message.
//  3. Stack traces are NEVER sent to the API client.
//  4. Full error detail (including stack) goes only to the logger (Winston),
//     which is wired to your observability sink (e.g. Sentry transport).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    // Handle Multer errors (file size, unexpected field, MIME type)
    if (err instanceof multer.MulterError || err?.code === "LIMIT_FILE_SIZE") {
        const msg =
            err.code === "LIMIT_FILE_SIZE"
                ? `File too large. Maximum allowed size exceeded.`
                : err.message || "File upload error";
        logger.warn(`Upload rejected [${err.code}]: ${msg} — path=${req.path}`);
        return res.status(400).json({ success: false, message: msg });
    }

    // Log full details to Winston (observability sink)
    logger.error(`Unhandled error on ${req.method} ${req.path}: ${err?.message}`, {
        stack: err?.stack,
        // req metadata (never log body — may contain passwords/tokens)
        method: req.method,
        path: req.path,
        userId: req.user?._id,
    });

    // Public response: zero internal detail
    res.status(err?.status || 500).json({
        success: false,
        error: "An unexpected error occurred. Please try again later.",
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
});
