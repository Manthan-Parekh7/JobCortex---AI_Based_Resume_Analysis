import crypto from "crypto";

export function normalizeText(text = "") {
    return String(text).replace(/\s+/g, " ").trim();
}

export function hashText(text = "") {
    const normalized = normalizeText(text);
    return crypto.createHash("sha256").update(normalized).digest("hex");
}
