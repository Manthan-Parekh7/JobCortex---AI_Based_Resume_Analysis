import User from "../models/User.js";
import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";

dotenv.config();

// Google Strategy
passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails[0].value;
                let user = await User.findOne({ email });

                if (!user) {
                    user = await User.create({
                        email,
                        username: profile.displayName,
                        image: profile.photos[0].value,
                        googleId: profile.id,
                        provider: "google",
                        isVerified: true, // <== Add this line
                        role: null, // Role will be set during onboarding
                    });
                } else {
                    // Existing user found by email
                    // If this is the first time linking Google, attach googleId and normalize provider
                    const isFirstGoogleLink = !user.googleId;
                    if (isFirstGoogleLink) {
                        user.googleId = profile.id;
                        user.provider = "google";
                        // Force onboarding for fairness if user previously came from local auth
                        // so they can choose their role again during first OAuth sign-in
                        if (user.role) {
                            user.role = null;
                        }
                        await user.save();
                    }
                }

                return done(null, user); // 🔁 Return user object (no session)
            } catch (error) {
                return done(error, false);
            }
        },
    ),
);

// GitHub Strategy
passport.use(
    new GitHubStrategy(
        {
            clientID: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            callbackURL: process.env.GITHUB_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                let email = profile.emails?.[0]?.value;

                if (!email) {
                    const res = await fetch("https://api.github.com/user/emails", {
                        headers: {
                            Authorization: `token ${accessToken}`,
                            "User-Agent": "Node.js",
                        },
                    });
                    const emails = await res.json();
                    email = emails.find((e) => e.primary && e.verified)?.email;
                }

                if (!email) return done(new Error("No email found"), false);

                let user = await User.findOne({ email });

                if (!user) {
                    user = await User.create({
                        email,
                        username: profile.displayName || profile.username,
                        image: profile.photos?.[0]?.value || null,
                        githubId: profile.id,
                        provider: "github",
                        isVerified: true, // <== Add this line
                        role: null, // Role will be set during onboarding
                    });
                } else {
                    // Existing user found by email
                    // If this is the first time linking GitHub, attach githubId and normalize provider
                    const isFirstGithubLink = !user.githubId;
                    if (isFirstGithubLink) {
                        user.githubId = profile.id;
                        user.provider = "github";
                        // Force onboarding for fairness if user previously came from local auth
                        if (user.role) {
                            user.role = null;
                        }
                        await user.save();
                    }
                }

                return done(null, user); // 🔁 Return user
            } catch (error) {
                return done(error, false);
            }
        },
    ),
);

export default passport;
