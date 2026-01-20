/**
 * Cache Service
 * 
 * Provides in-memory caching for frequently accessed data
 * with TTL support, invalidation, and statistics
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutes default
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
  };

  /**
   * Set cache entry with optional TTL
   */
  public set<T>(key: string, value: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs || this.defaultTTL);
    this.cache.set(key, { value, expiresAt });
    this.stats.sets++;
  }

  /**
   * Get cache entry if not expired
   */
  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Get or set cache entry
   */
  public async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Delete cache entry
   */
  public delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) this.stats.deletes++;
    return deleted;
  }

  /**
   * Invalidate all entries matching pattern
   */
  public invalidate(pattern: string): number {
    let count = 0;
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.stats.deletes += count;
    return count;
  }

  /**
   * Clear all cache
   */
  public clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };
  }

  /**
   * Get cache statistics
   */
  public getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : '0.00';

    return {
      ...this.stats,
      total,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
    };
  }

  /**
   * Cache budget report
   */
  public cacheBudgetReport(departmentId: string, report: any, ttlMs?: number): void {
    this.set(`budget:report:${departmentId}`, report, ttlMs || 10 * 60 * 1000);
  }

  /**
   * Get cached budget report
   */
  public getBudgetReport(departmentId: string): any | null {
    return this.get(`budget:report:${departmentId}`);
  }

  /**
   * Cache revenue summary
   */
  public cacheRevenueReport(jobId: string, report: any, ttlMs?: number): void {
    this.set(`revenue:report:${jobId}`, report, ttlMs || 10 * 60 * 1000);
  }

  /**
   * Get cached revenue report
   */
  public getRevenueReport(jobId: string): any | null {
    return this.get(`revenue:report:${jobId}`);
  }

  /**
   * Cache evaluation aggregation
   */
  public cacheEvaluationAggregation(cycleId: string, aggregation: any, ttlMs?: number): void {
    this.set(`evaluation:agg:${cycleId}`, aggregation, ttlMs || 15 * 60 * 1000);
  }

  /**
   * Get cached evaluation aggregation
   */
  public getEvaluationAggregation(cycleId: string): any | null {
    return this.get(`evaluation:agg:${cycleId}`);
  }

  /**
   * Cache staffing utilization
   */
  public cacheStaffingUtilization(departmentId: string, utilization: any, ttlMs?: number): void {
    this.set(`staffing:util:${departmentId}`, utilization, ttlMs || 10 * 60 * 1000);
  }

  /**
   * Get cached staffing utilization
   */
  public getStaffingUtilization(departmentId: string): any | null {
    return this.get(`staffing:util:${departmentId}`);
  }

  /**
   * Invalidate all budget cache
   */
  public invalidateBudgetCache(): number {
    return this.invalidate('^budget:');
  }

  /**
   * Invalidate all revenue cache
   */
  public invalidateRevenueCache(): number {
    return this.invalidate('^revenue:');
  }

  /**
   * Invalidate all evaluation cache
   */
  public invalidateEvaluationCache(): number {
    return this.invalidate('^evaluation:');
  }

  /**
   * Invalidate all staffing cache
   */
  public invalidateStaffingCache(): number {
    return this.invalidate('^staffing:');
  }
}

export default new CacheService();
