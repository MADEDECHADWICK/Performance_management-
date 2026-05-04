const path = require("path");

// Load .env before Jest initializes any modules (Prisma throws if DATABASE_URL is missing at import time).
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

module.exports = {
  rootDir: __dirname,
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/**/*.test.ts"],
  testTimeout: 30000,
  clearMocks: true,
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: path.join(__dirname, "tsconfig.json") }],
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
};
