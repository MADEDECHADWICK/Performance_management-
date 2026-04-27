import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaAdapter?: PrismaPg;
};

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DIRECT_DATABASE_URL or DATABASE_URL must be set before Prisma is initialized.");
}

const isRemote =
  !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");

const pool = new Pool({
  connectionString,
  ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
});

const prismaAdapter =
  globalForPrisma.prismaAdapter ?? new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: prismaAdapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaAdapter = prismaAdapter;
}

export default prisma;
