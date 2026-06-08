// utils/getOrParseResumeText.js
import { downloadFileBuffer } from "./fileDownloader.js";
import { extractTextFromPDF, extractTextFromDocx } from "./fileParser.js";
import User from "../models/User.js";
import { hashText } from "./textHash.js";

export async function getOrParseResumeText(userId) {
    // Guard: user must exist
    const user = await User.findById(userId).select("resume resumeText resumeTextHash");
    if (!user) {
        throw new Error("User not found");
    }

    // Guard: resume must be uploaded before we try to parse it
    if (!user.resume) {
        throw new Error("Resume not uploaded");
    }

    // 1. Return cached plain text if available
    if (user.resumeText) {
        const cachedHash = user.resumeTextHash || hashText(user.resumeText);
        if (!user.resumeTextHash) {
            await User.findByIdAndUpdate(userId, { $set: { resumeTextHash: cachedHash } });
        }
        return { text: user.resumeText, hash: cachedHash };
    }

    // 2. Download file buffer from resume URL
    const fileBuffer = await downloadFileBuffer(user.resume);

    // Guard: buffer must be non-empty and large enough for magic-byte detection
    if (!fileBuffer || fileBuffer.length < 4) {
        throw new Error("Invalid or empty resume file");
    }

    // 3. Extract text based on file type (magic-byte detection)
    let text;
    if (fileBuffer[0] === 0x25 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x44 && fileBuffer[3] === 0x46) {
        // PDF magic number (%PDF)
        text = await extractTextFromPDF(fileBuffer);
    } else if (fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b) {
        // DOCX magic number (PK zip)
        text = await extractTextFromDocx(fileBuffer);
    } else {
        throw new Error("Unsupported file type: only PDF and DOCX are allowed");
    }

    // 4. Cache the extracted text in DB for subsequent calls
    const textHash = hashText(text);
    await User.findByIdAndUpdate(userId, { $set: { resumeText: text, resumeTextHash: textHash } });

    return { text, hash: textHash };
}
