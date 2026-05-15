// src/context/AuthContext.jsx
import React, { createContext, useEffect, useState } from "react";
import api, { loginUser, signupUser, getMe, verifyOtpApi, logoutUser } from "../api/api";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);          // logged-in user object
    const [loading, setLoading] = useState(true);    // while checking session
    const [accessToken, setAccessToken] = useState(null); // optional (in-memory) access token
    const [isLoggingOut, setIsLoggingOut] = useState(false); // track logout state
    const navigate = useNavigate();

    // OTP flow states
    const [otpDialogOpen, setOtpDialogOpen] = useState(false);
    const [pendingUser, setPendingUser] = useState(null);

    // Load current user on mount
    const loadUser = async () => {
        setLoading(true);
        try {
            if (import.meta.env.DEV) console.debug("AuthContext: loadUser start");
            const data = await getMe();
            setUser(data.user || null);
            if (import.meta.env.DEV) console.debug("AuthContext: loadUser success");
        } catch {
            setUser(null);
            if (import.meta.env.DEV) console.debug("AuthContext: loadUser failed (unauthenticated or network)");
        } finally {
            setLoading(false);
        }
    };

    // Parse query params for OAuth callback
    const handleOAuthCallback = () => {
        // Check if we have user data in URL (from OAuth callback)
        const urlParams = new URLSearchParams(window.location.search);
        const userParam = urlParams.get('user');

        if (userParam) {
            try {
                // Decode the user object from the URL
                const userData = JSON.parse(decodeURIComponent(userParam));
                if (userData && userData.user) {
                    setUser(userData.user);
                    // Clean the URL by removing the query parameter
                    window.history.replaceState({}, document.title, window.location.pathname);

                    // If user doesn't have a role and not already on onboarding, redirect
                    if (!userData.user.role && window.location.pathname !== '/onboarding') {
                        navigate('/onboarding');
                    }
                }
            } catch {
                if (import.meta.env.DEV) console.debug("AuthContext: failed to parse OAuth user data from URL");
            }
        }
    };

    useEffect(() => {
        // Check for OAuth callback data first
        handleOAuthCallback();
        // Then load user if no OAuth data was found
        loadUser();
        // We deliberately don't include 'user' in the dependency array
        // as we only want this to run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Email/password login
    const login = async (credentials) => {
        setLoading(true);
        try {
            const data = await loginUser(credentials);
            if (import.meta.env.DEV) console.debug("AuthContext: login success");
            setUser(data.user || null);
            if (data.accessToken) setAccessToken(data.accessToken);
            return { success: true, data };
        } catch (err) {
            if (import.meta.env.DEV) console.debug("AuthContext: login error", err.message);
            setUser(null);
            return { success: false, error: err.message || "An unknown error occurred." };
        } finally {
            setLoading(false);
        }
    };

    // Signup flow (server may require OTP)
    const signup = async (payload) => {
        setLoading(true);
        try {
            const data = await signupUser(payload);
            if (import.meta.env.DEV) console.debug("AuthContext: signup success");
            // store user temporarily until OTP verified
            setPendingUser(data.user || null);
            setOtpDialogOpen(true);
            return { success: true, message: data.message, user: data.user };
        } catch (err) {
            if (import.meta.env.DEV) console.debug("AuthContext: signup error", err.message);
            return { success: false, error: err.message || "An unknown error occurred." };
        } finally {
            setLoading(false);
        }
    };

    // OTP verification after signup
    const verifyOtp = async (otpPayload) => {
        setLoading(true);
        try {
            const data = await verifyOtpApi(otpPayload); // { message, user }
            if (import.meta.env.DEV) console.debug("AuthContext: verifyOtp success");
            setUser(data.user || null);
            setPendingUser(null);
            setOtpDialogOpen(false);

            // Redirect to onboarding if user doesn't have a role
            if (data.user && !data.user.role) {
                navigate('/onboarding');
            }

            return { success: true, user: data.user };
        } catch (err) {
            if (import.meta.env.DEV) console.debug("AuthContext: verifyOtp error", err.message);
            return { success: false, error: err.message || "An unknown error occurred." };
        } finally {
            setLoading(false);
        }
    };

    // Logout
    const logout = async () => {
        setIsLoggingOut(true); // Set logout flag
        setLoading(true);
        try {
            await logoutUser();
        } catch {
            // ignore
        } finally {
            setUser(null);
            setAccessToken(null);
            setLoading(false);
            toast.success("Logged out successfully!");
            navigate("/"); // Redirect to home after logout
            // Reset logout flag after navigation
            setTimeout(() => setIsLoggingOut(false), 100);
        }
    };

    // OAuth redirects
    const loginWithGoogle = () => {
        window.location.href = `${api.defaults.baseURL}auth/google`;
    };

    const loginWithGithub = () => {
        window.location.href = `${api.defaults.baseURL}auth/github`;
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                setUser, // Expose setUser
                loading,
                isLoggingOut,
                accessToken,
                login,
                signup,
                verifyOtp,
                logout,
                loginWithGoogle,
                loginWithGithub,
                // OTP flow
                otpDialogOpen,
                setOtpDialogOpen,
                pendingUser,
                setPendingUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};


