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
