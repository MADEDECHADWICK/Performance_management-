/**
 * Jest Setup File
 * Runs before all tests to initialize environment
 */

import { PrismaClient } from '@prisma/client';

// Suppress Prisma logs during tests
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/perf_mgmt_test';

// Optional: Setup global test timeout
jest.setTimeout(30000);

// Optional: Add custom matchers if needed
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Global teardown to ensure prisma client is disconnected
afterAll(async () => {
  const prisma = new PrismaClient();
  await prisma.$disconnect();
});
