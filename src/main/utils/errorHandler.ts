/**
 * Standard error response format for IPC handlers
 */
export interface ErrorResponse {
  error?: string
  success?: boolean
}

/**
 * Standard success response format for IPC handlers
 */
export interface SuccessResponse<T = any> extends ErrorResponse {
  success: true
  data?: T
}

/**
 * Wrap async IPC handler with standardized error handling
 */
export function wrapHandler<T = any>(
  handler: () => Promise<T>
): Promise<SuccessResponse<T> | ErrorResponse> {
  return handler()
    .then((data) => ({ success: true, data } as SuccessResponse<T>))
    .catch((err) => {
      console.error('[IPC Error]', err)
      return { error: err.message || 'Unknown error' }
    })
}

/**
 * Wrap sync IPC handler with standardized error handling
 */
export function wrapSyncHandler<T = any>(
  handler: () => T
): SuccessResponse<T> | ErrorResponse {
  try {
    const data = handler()
    return { success: true, data }
  } catch (err: any) {
    console.error('[IPC Error]', err)
    return { error: err.message || 'Unknown error' }
  }
}

/**
 * Log error with context
 */
export function logError(context: string, error: any): void {
  console.error(`[${context}]`, error?.message || error)
  if (error?.stack) {
    console.error(error.stack)
  }
}

/**
 * Create error response
 */
export function createErrorResponse(message: string): ErrorResponse {
  return { error: message }
}

/**
 * Create success response
 */
export function createSuccessResponse<T = any>(data?: T): SuccessResponse<T> {
  return { success: true, data }
}
