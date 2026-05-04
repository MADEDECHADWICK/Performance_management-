const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

export const BASE_URL = trimTrailingSlashes(
  import.meta.env.VITE_API_URL || "http://localhost:4000"
);

export const API_BASE_URL = `${BASE_URL}/api`;
