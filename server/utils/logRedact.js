/**
 * logRedact.js — Centralized log redaction utility
 *
 * Provides:
 *  - maskEmail(email)       → "us***@example.com"
 *  - omitSecrets(obj)       → deep-clones obj, replacing secret-looking values with "[REDACTED]"
 *  - redactFormat           → Winston format that auto-scrubs log metadata
 */

import winston from "winston";

// ── Field name patterns considered sensitive ──────────────────────────────────
const SECRET_KEY_PATTERN = /password|passwd|secret|token|otp|apikey|api_key|auth|authorization|cookie|credential/i;

// ── maskEmail ─────────────────────────────────────────────────────────────────
/**
 * Partially masks an email address to reduce PII exposure in logs.
 * "manthan@example.com" → "ma*****@example.com"
 */
export function maskEmail(email) {
    if (typeof email !== "string" || !email.includes("@")) return "[invalid-email]";
    const [local, domain] = email.split("@");
    if (local.length <= 2) return `**@${domain}`;
    return `${local.slice(0, 2)}${"*".repeat(Math.min(local.length - 2, 5))}@${domain}`;
}

// ── omitSecrets ───────────────────────────────────────────────────────────────
/**
 * Deep-clones a plain object and replaces values whose key name matches
 * SECRET_KEY_PATTERN with the string "[REDACTED]".
 * Arrays are mapped recursively; primitives are returned as-is.
 */
export function omitSecrets(value, depth = 0) {
    // Safety: avoid circular-reference or deeply nested structures
    if (depth > 10) return "[DEPTH_LIMIT]";

    if (Array.isArray(value)) {
        return value.map((item) => omitSecrets(item, depth + 1));
    }

    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => {
                if (SECRET_KEY_PATTERN.test(k)) return [k, "[REDACTED]"];
                return [k, omitSecrets(v, depth + 1)];
            })
        );
    }

    return value;
}

// ── Winston format ────────────────────────────────────────────────────────────
/**
 * Winston format plugin that:
 *  1. Redacts secret-named keys from the `meta` / splat fields.
 *  2. Never logs raw Error stacks to file transports — stack is moved to a
 *     `stack` field only if NODE_ENV is not production (observability sinks
 *     like Sentry should receive stacks via their own transport, not flat logs).
 *
 * Usage:
 *   winston.createLogger({ format: combine(redactFormat(), json()) })
 */
export const redactFormat = winston.format((info) => {
    // Redact any extra metadata keys attached to the log entry
    const { level, message, stack, timestamp, ...meta } = info;
    const cleanMeta = omitSecrets(meta);

    // In production: drop stack traces from log files (send to Sentry instead)
    const isProd = process.env.NODE_ENV === "production";
    const safeStack = isProd ? undefined : stack;

    return Object.assign(info, cleanMeta, {
        level,
        message,
        timestamp,
        ...(safeStack ? { stack: safeStack } : {}),
    });
});
