// This file provides functions for managing JWT (JSON Web Token) secrets used for authentication in the application. It includes functionality to retrieve the JWT secret from environment variables, validate its strength, and ensure that it is properly configured. The module also includes a set of known weak secrets that are not allowed in production environments. By centralizing JWT secret management in this module, we can enforce security best practices and prevent the use of weak secrets that could compromise the security of the application.

const INSECURE_JWT_SECRETS = new Set([
  "secret",
  "change-me",
  "changeme",
  "ronalds-gmp-secure-key-2024",
]);

const isTestEnv = () => process.env.NODE_ENV === "test";

export const getJwtSecret = (): string => {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  if (!isTestEnv()) {
    const normalized = secret.toLowerCase();
    if (secret.length < 32 || INSECURE_JWT_SECRETS.has(normalized)) {
      throw new Error("JWT_SECRET is weak. Use a strong secret (32+ chars).");
    }
  }

  return secret;
};

export const assertJwtSecretConfigured = (): void => {
  getJwtSecret();
};
