import mongoose from "mongoose";
import logger from "./logger.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/jobportal";

const connectDB = async () => {
    await mongoose.connect(MONGO_URI);
    logger.info("MongoDB connected successfully");
};

export default connectDB;
