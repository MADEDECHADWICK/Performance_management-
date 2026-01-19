/**
 * Response utility for standardized API responses
 * Used across all route handlers to maintain consistency
 */

export interface SuccessResponse<T = any> {
  success: true;
  statusCode: number;
  data: T;
  message: string;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  details?: any;
  timestamp: string;
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

/**
 * Format success response
 * @param data - Response data
 * @param message - Success message
 * @param statusCode - HTTP status code (default: 200)
 */
export const successResponse = <T = any>(
  data: T,
  message: string = "Success",
  statusCode: number = 200
): SuccessResponse<T> => ({
  success: true,
  statusCode,
  data,
  message,
  timestamp: new Date().toISOString(),
});

/**
 * Format error response
 * @param error - Error message
 * @param statusCode - HTTP status code (default: 400)
 * @param details - Optional error details
 */
export const errorResponse = (
  error: string,
  statusCode: number = 400,
  details?: any
): ErrorResponse => ({
  success: false,
  statusCode,
  error,
  details,
  timestamp: new Date().toISOString(),
});

/**
 * Paginated response helper
 * @param items - Array of items
 * @param total - Total count
 * @param page - Current page
 * @param pageSize - Items per page
 * @param message - Success message
 */
export const paginatedResponse = <T = any>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  message: string = "Success"
): SuccessResponse<{ items: T[]; pagination: any }> => {
  const totalPages = Math.ceil(total / pageSize);
  return {
    success: true,
    statusCode: 200,
    data: {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    },
    message,
    timestamp: new Date().toISOString(),
  };
};
