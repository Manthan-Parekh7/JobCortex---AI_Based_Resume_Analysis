import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendEmail } from "../utils/emailService.js";
import logger from "../config/logger.js"; // Winston logger import

// Generate access & refresh tokens
const generateTokens = (user) => {
    const accessToken = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" });

    const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

    return { accessToken, refreshToken };
};

// Set cookies for tokens
const setAuthCookies = (res, accessToken, refreshToken) => {
    const isProd = process.env.NODE_ENV === "production";

    res.cookie("access_token", accessToken, {
        httpOnly: true,
        secure: true, // Always secure for SameSite: None
        sameSite: "None",
        maxAge: 15 * 60 * 1000,
        path: "/",
    });

    res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: true, // Always secure for SameSite: None
        sameSite: "None",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
    });
};

// Clear cookies
const clearAuthCookies = (res) => {
    const isProd = process.env.NODE_ENV === "production";
    const opts = {
        httpOnly: true,
        secure: true, // Always secure for SameSite: None
        sameSite: "None",
        path: "/",
    };
    res.clearCookie("access_token", opts);
    res.clearCookie("refresh_token", opts);
};

// Helper: Issue tokens and set cookies
const issueTokensAndSetCookies = async (user, res) => {
    const { accessToken, refreshToken } = generateTokens(user);
    user.refreshToken = refreshToken;
    await user.save();
    setAuthCookies(res, accessToken, refreshToken);
};

// Google OAuth start
export const googleAuth = (req, res, next) => next();

// Google OAuth callback
export const googleCallback = async (req, res) => {
    try {
        logger.info(`Google OAuth callback userId=${req.user?._id} provider=google`);
        if (!req.user.isVerified) {
            req.user.isVerified = true;
            logger.info(`User ${req.user.email} verified via Google OAuth`);
        }
        await issueTokensAndSetCookies(req.user, res);

        // Check if user has a role, if not redirect to onboarding
        const redirectPath = req.user.role ? "" : "/onboarding";

        // Send user data to CLIENT_URL as query param (URL-safe)
        const userObj = encodeURIComponent(JSON.stringify({ user: req.user }));
        return res.redirect(`${process.env.CLIENT_URL}${redirectPath}?user=${userObj}`);
    } catch (err) {
        logger.error(`Google callback error: ${err.message}`, { stack: err.stack });
        return res.redirect("/login?error=oauth");
    }
};

// GitHub OAuth start
export const githubAuth = (req, res, next) => next();

// GitHub OAuth callback
export const githubCallback = async (req, res) => {
    try {
        logger.info(`GitHub OAuth callback userId=${req.user?._id} provider=github`);
        if (!req.user.isVerified) {
            req.user.isVerified = true;
            logger.info(`User ${req.user.email} verified via GitHub OAuth`);
        }
        await issueTokensAndSetCookies(req.user, res);

        // Check if user has a role, if not redirect to onboarding
        const redirectPath = req.user.role ? "" : "/onboarding";

        // Send user data to CLIENT_URL as query param (URL-safe)
        const userObj = encodeURIComponent(JSON.stringify({ user: req.user }));
        return res.redirect(`${process.env.CLIENT_URL}${redirectPath}?user=${userObj}`);
    } catch (err) {
        logger.error(`GitHub callback error: ${err.message}`, { stack: err.stack });
        return res.redirect("/login?error=oauth");
    }
};

// Local signup (without role requirement - role selected in onboarding)
export const signup = async (req, res) => {
    const { email, password, username } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            logger.warn(`Signup attempt with already registered email: ${email}`);
            return res.status(400).json({ success: false, message: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Using random OTP for verification
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

        logger.info(`Generated OTP for ${email}`); // OTP value intentionally omitted from logs

        await User.create({
            email,
            username,
            password: hashedPassword,
            provider: "local",
            role: null, // Role will be set during onboarding
            otp,
            otpExpires,
            isVerified: false,
        });

        const message = `Your verification code is: ${otp}. It will expire in 15 minutes.`;
        await sendEmail(email, "Verify your email for JobCortex", message);

        logger.info(`User signed up with email ${email}, OTP sent`);
        return res.status(201).json({ success: true, message: "User created. Check your email for OTP to verify your account." });
    } catch (err) {
        logger.error(`Signup error for email ${email}: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ success: false, message: "Signup failed", details: err.message });
    }
};

// Verify OTP and log user in
export const verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            logger.warn(`OTP verification failed: user not found for email ${email}`);
            return res.status(400).json({ success: false, message: "User not found" });
        }
        if (user.isVerified) {
            logger.warn(`OTP verification attempt on already verified user ${email}`);
            return res.status(400).json({ success: false, message: "User already verified" });
        }
        if (user.otp !== otp) {
            logger.warn(`Invalid OTP entered for user ${email}`);
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }
        if (user.otpExpires < new Date()) {
            logger.warn(`Expired OTP used for user ${email}`);
            return res.status(400).json({ success: false, message: "OTP expired" });
        }

        user.isVerified = true;
        user.otp = null;
        user.otpExpires = null;

        await issueTokensAndSetCookies(user, res);
        logger.info(`User ${email} verified successfully via OTP`);
        return res.json({ success: true, message: "Email verified successfully", user });
    } catch (err) {
        logger.error(`OTP verification error for email ${email}: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ success: false, message: "Verification failed", details: err.message });
    }
};

// Resend OTP
export const resendOtp = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            logger.warn(`Resend OTP failed: user not found for email ${email}`);
            return res.status(400).json({ success: false, message: "User not found" });
        }
        if (user.isVerified) {
            logger.warn(`Resend OTP called for already verified user ${email}`);
            return res.status(400).json({ success: false, message: "User already verified" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        const message = `Your new verification code is: ${otp}. It will expire in 15 minutes.`;
        await sendEmail(email, "Resend: Verify your email for JobCortex", message);

        logger.info(`OTP resent to user ${email}`);
        return res.json({ success: true, message: "OTP resent, check your email" });
    } catch (err) {
        logger.error(`Resend OTP error for email ${email}: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ success: false, message: "Resend OTP failed", details: err.message });
    }
};

// Local login
export const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || user.provider !== "local") {
            logger.warn(`Login failed for email ${email}: invalid credentials`);
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            logger.warn(`Login failed for email ${email}: incorrect password`);
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        if (!user.isVerified) {
            logger.warn(`Login attempt for unverified user ${email}`);
            return res.status(403).json({ success: false, message: "Please verify your email" });
        }

        await issueTokensAndSetCookies(user, res);
        logger.info(`User logged in successfully: ${email}`);
        return res.status(200).json({ success: true, message: "Login successful", user });
    } catch (err) {
        logger.error(`Login error for email ${email}: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ success: false, message: "Login failed", details: err.message });
    }
};

// Refresh token
export const refreshToken = async (req, res) => {
    try {
        const incoming = req.cookies?.refresh_token;
        if (!incoming) {
            logger.warn("Refresh token missing from request");
            return res.status(401).json({ success: false, message: "No refresh token" });
        }

        const clear = () => clearAuthCookies(res);

        let payload;
        try {
            payload = jwt.verify(incoming, process.env.JWT_REFRESH_SECRET);
        } catch (err) {
            clear();
            logger.warn(`Refresh token verification failed: ${err.name === "TokenExpiredError" ? "expired" : "invalid"}`);
            return res.status(401).json({
                success: false,
                message: err?.name === "TokenExpiredError" ? "Refresh token expired" : "Invalid refresh token",
            });
        }

        const user = await User.findById(payload.id);
        if (!user || !user.refreshToken) {
            clear();
            logger.warn("Invalid session or no refresh token found");
            return res.status(401).json({ success: false, message: "Invalid session" });
        }

        if (user.refreshToken !== incoming) {
            user.refreshToken = null;
            await user.save();
            clear();
            logger.warn(`Refresh token mismatch for user ${user.email}`);
            return res.status(401).json({ success: false, message: "Refresh token mismatch" });
        }

        await issueTokensAndSetCookies(user, res);
        logger.info(`Refresh token rotated and tokens issued for user ${user.email}`);
        return res.json({ success: true, message: "Token refreshed" });
    } catch (err) {
        logger.error(`Refresh token error: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ success: false, message: "Refresh failed", details: err.message });
    }
};

// Get authenticated user
export const getMe = async (req, res) => {
    try {
        // req.user is populated by the protect middleware
        if (!req.user) {
            logger.warn("getMe: req.user is not populated, likely no valid token");
            return res.status(401).json({ success: false, message: "Not authenticated" });
        }
        logger.info(`getMe: User ${req.user.email} fetched successfully`);
        return res.status(200).json({ success: true, user: req.user });
    } catch (err) {
        logger.error(`getMe error: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ success: false, message: "Failed to fetch user data" });
    }
};

// Logout
export const logout = async (req, res) => {
    try {
        const refreshToken = req.cookies?.refresh_token;
        if (refreshToken) {
            try {
                const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
                const user = await User.findById(decoded.id);
                if (user && user.refreshToken === refreshToken) {
                    user.refreshToken = null;
                    await user.save();
                }
            } catch {
                // ignore decoding errors on logout
            }
        }

        clearAuthCookies(res);

        if (req.method === "GET" && req.accepts(["html", "json"]) === "html") {
            return res.redirect("/loggedOut");
        }

        logger.info(`User logged out`);
        return res.json({ success: true, message: "Logged out" });
    } catch (err) {
        logger.error(`Logout error: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ success: false, message: "Logout failed", details: err.message });
    }
};

// Update user role (for onboarding)
export const updateRole = async (req, res) => {
    try {
        const { role } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        if (!role || !["candidate", "recruiter"].includes(role)) {
            return res.status(400).json({ success: false, message: "Valid role required (candidate or recruiter)" });
        }

        const user = await User.findByIdAndUpdate(userId, { role }, { new: true }).select("-password -otp -otpExpires");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        logger.info(`User ${user.email} updated role to ${role}`);
        return res.json({
            success: true,
            message: `Role updated to ${role}`,
            user,
        });
    } catch (err) {
        logger.error(`Update role error: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ success: false, message: "Failed to update role", details: err.message });
    }
};
