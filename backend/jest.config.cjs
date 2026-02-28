const path = require("path");

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
  moduleFileExtensions: ["ts", "js", "json"],
};
