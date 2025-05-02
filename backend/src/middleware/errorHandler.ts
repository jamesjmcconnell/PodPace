import { jsonResponse, errorResponse } from '../../utils/responseUtils'; // Adjust path
import { AppError, ValidationError } from './validator'; // Import custom errors
import { ZodError } from 'zod'; // Import ZodError for potential direct catching

/**
 * Global error handler middleware.
 * Catches known error types (AppError, ValidationError, ZodError)
 * and formats appropriate JSON error responses.
 * Returns a generic 500 error for unknown exceptions.
 * @param error The error object caught.
 * @param req Optional request object (currently unused but good practice).
 * @returns A Response object containing the formatted error.
 */
export function errorHandler(error: any, req?: Request): Response { // req is optional
    console.error('[ErrorHandler] Caught error:', error);

    if (error instanceof ValidationError) {
        console.log('[ErrorHandler] Handling ValidationError...');
        return jsonResponse(
            {
                error: error.message,
                details: error.details,
            },
            error.statusCode
        );
    }

    if (error instanceof AppError) {
        console.log(`[ErrorHandler] Handling AppError (Status: ${error.statusCode})...`);
        return errorResponse(error.message, error.statusCode);
    }

    // Handle potential direct ZodErrors if not caught by validation middleware
    if (error instanceof ZodError) {
        console.log('[ErrorHandler] Handling direct ZodError...');
         return jsonResponse(
            {
                error: 'Invalid input data',
                details: error.flatten().fieldErrors,
            },
            400 // Bad Request
        );
    }

    // Handle generic Errors or other unexpected errors
    console.log('[ErrorHandler] Handling generic error...');
    // Avoid leaking sensitive details in production
    const message = process.env.NODE_ENV === 'production'
        ? 'An unexpected internal server error occurred.'
        : error.message || 'Internal Server Error';

    return errorResponse(message, 500);
}