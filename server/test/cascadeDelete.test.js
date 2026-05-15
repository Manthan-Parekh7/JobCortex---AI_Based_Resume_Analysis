/**
 * test/cascadeDelete.test.js
 *
 * Integration tests verifying cascade-delete behavior for:
 *  - Job.findOneAndDelete()  → Application records removed
 *  - jobDoc.deleteOne()      → Application records removed
 *  - User.findOneAndDelete() → Applications (and jobs/companies for recruiters) removed
 *
 * Uses an in-memory mongoose connection (mongodb-memory-server) if available,
 * or connects to the test DB defined in MONGO_TEST_URI env var.
 *
 * Run:  npm test
 */

import mongoose from "mongoose";
import { strict as assert } from "assert";
import Job from "../models/Job.js";
import Application from "../models/Application.js";
import User from "../models/User.js";
import Company from "../models/Company.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

let mongoServer;

async function createTestUser(role = "recruiter") {
    return User.create({
        email: `test-${Date.now()}-${Math.random()}@example.com`,
        username: "TestUser",
        provider: "local",
        isVerified: true,
        role,
    });
}

async function createTestCompany(recruiterId) {
    return Company.create({
        name: `Company-${Date.now()}`,
        createdBy: recruiterId,
        contactEmail: `company-${Date.now()}@test.com`,
        industry: "Technology",
    });
}

async function createTestJob(recruiterId, companyId) {
    return Job.create({
        title: "Test Job",
        description: "Test job description",
        company: companyId,
        recruiter: recruiterId,
    });
}

async function createTestApplication(jobId, candidateId, recruiterId) {
    return Application.create({
        job: jobId,
        candidate: candidateId,
        recruiter: recruiterId,
    });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

before(async function () {
    this.timeout(30000);

    // Prefer mongodb-memory-server if installed, else use env var or local
    let uri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/jobcortex_test";

    try {
        const { MongoMemoryServer } = await import("mongodb-memory-server");
        mongoServer = await MongoMemoryServer.create();
        uri = mongoServer.getUri();
        console.log("Using MongoMemoryServer:", uri);
    } catch {
        console.log("mongodb-memory-server not found, using:", uri);
    }

    await mongoose.connect(uri);
});

after(async function () {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
});

beforeEach(async function () {
    // Clean up between tests
    await Promise.all([
        Application.deleteMany({}),
        Job.deleteMany({}),
        Company.deleteMany({}),
        User.deleteMany({}),
    ]);
});

// ── Test suites ───────────────────────────────────────────────────────────────

describe("Cascade delete: Job → Applications", function () {
    this.timeout(10000);

    it("Job.findOneAndDelete() removes all linked Applications", async function () {
        const recruiter = await createTestUser("recruiter");
        const candidate = await createTestUser("candidate");
        const company = await createTestCompany(recruiter._id);
        const job = await createTestJob(recruiter._id, company._id);

        await createTestApplication(job._id, candidate._id, recruiter._id);
        await createTestApplication(job._id, candidate._id, recruiter._id);

        // Sanity: 2 applications exist
        assert.equal(await Application.countDocuments({ job: job._id }), 2);

        await Job.findOneAndDelete({ _id: job._id });

        // Hook should have deleted them
        const remaining = await Application.countDocuments({ job: job._id });
        assert.equal(remaining, 0, "findOneAndDelete hook should cascade-delete Applications");
    });

    it("jobDoc.deleteOne() removes all linked Applications", async function () {
        const recruiter = await createTestUser("recruiter");
        const candidate = await createTestUser("candidate");
        const company = await createTestCompany(recruiter._id);
        const job = await createTestJob(recruiter._id, company._id);

        await createTestApplication(job._id, candidate._id, recruiter._id);
        await createTestApplication(job._id, candidate._id, recruiter._id);
        await createTestApplication(job._id, candidate._id, recruiter._id);

        assert.equal(await Application.countDocuments({ job: job._id }), 3);

        // Reload so we have a full Mongoose document (hooks bound)
        const jobDoc = await Job.findById(job._id);
        await jobDoc.deleteOne();

        const remaining = await Application.countDocuments({ job: job._id });
        assert.equal(remaining, 0, "doc.deleteOne() hook should cascade-delete Applications");
    });

    it("Deleting a job does NOT affect Applications for other jobs", async function () {
        const recruiter = await createTestUser("recruiter");
        const candidate = await createTestUser("candidate");
        const company = await createTestCompany(recruiter._id);

        const job1 = await createTestJob(recruiter._id, company._id);
        const job2 = await createTestJob(recruiter._id, company._id);

        await createTestApplication(job1._id, candidate._id, recruiter._id);
        await createTestApplication(job2._id, candidate._id, recruiter._id);

        await Job.findOneAndDelete({ _id: job1._id });

        // job1 applications gone
        assert.equal(await Application.countDocuments({ job: job1._id }), 0);
        // job2 applications untouched
        assert.equal(await Application.countDocuments({ job: job2._id }), 1);
    });
});

describe("Cascade delete: User (recruiter) → Jobs + Applications", function () {
    this.timeout(10000);

    it("User.findOneAndDelete() for a recruiter removes their Jobs and Applications", async function () {
        const recruiter = await createTestUser("recruiter");
        const candidate = await createTestUser("candidate");
        const company = await createTestCompany(recruiter._id);
        const job = await createTestJob(recruiter._id, company._id);

        await createTestApplication(job._id, candidate._id, recruiter._id);

        assert.equal(await Job.countDocuments({ recruiter: recruiter._id }), 1);
        assert.equal(await Application.countDocuments({ recruiter: recruiter._id }), 1);

        await User.findOneAndDelete({ _id: recruiter._id });

        assert.equal(await Job.countDocuments({ recruiter: recruiter._id }), 0);
        assert.equal(await Application.countDocuments({ recruiter: recruiter._id }), 0);
    });
});

describe("Cascade delete: User (candidate) → Applications", function () {
    this.timeout(10000);

    it("User.findOneAndDelete() for a candidate removes their Applications", async function () {
        const recruiter = await createTestUser("recruiter");
        const candidate = await createTestUser("candidate");
        const company = await createTestCompany(recruiter._id);
        const job = await createTestJob(recruiter._id, company._id);

        await createTestApplication(job._id, candidate._id, recruiter._id);
        await createTestApplication(job._id, candidate._id, recruiter._id);

        assert.equal(await Application.countDocuments({ candidate: candidate._id }), 2);

        await User.findOneAndDelete({ _id: candidate._id });

        assert.equal(await Application.countDocuments({ candidate: candidate._id }), 0);
    });
});
