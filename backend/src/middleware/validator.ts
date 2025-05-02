import { z, ZodError } from 'zod';
import { errorResponse } from '../../utils/responseUtils'; // Adjust path as needed

/**
 * Base class for application-specific errors.
 * Includes an HTTP status code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Represents an error during request validation.
 * Extends AppError with a 400 status code and includes details.
 */
export class ValidationError extends AppError {
  public readonly details: object;
  constructor(message: string = 'Validation Failed', details: object) {
    super(message, 400); // Bad Request
    this.details = details;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Creates a middleware function that validates the request body against a Zod schema.
 * Parses the request body as JSON and uses the provided schema for validation.
 * Throws ValidationError on failure.
 * @template T Zod schema type.
 * @param schema The Zod schema to validate against.
 * @returns An async function (middleware) that validates the request and returns the parsed data or throws.
 */
export function validateBody<T extends z.ZodTypeAny>(
    schema: T
): (req: Request) => Promise<z.infer<T>> { // Returns middleware async function

    return async (req: Request) => {
        console.log(`[Validator] Validating request body for: ${req.method} ${req.url}`);
        let body: any;
        try {
            if (!req.headers.get('content-type')?.includes('application/json')) {
                 console.warn('[Validator] Request body validation skipped: Not application/json');
                 // Consider throwing an error for non-JSON if strictly required
                 // throw new AppError('Request body must be application/json', 415);
            }
            body = await req.json();
        } catch (e) {
            console.error('[Validator] Failed to parse request body as JSON:', e);
            throw new AppError('Invalid request body: Must be valid JSON', 400);
        }

        const validationResult = schema.safeParse(body);

        if (!validationResult.success) {
            console.error('[Validator] Body validation failed:', validationResult.error.flatten());
            throw new ValidationError(
                'Invalid request body',
                validationResult.error.flatten().fieldErrors
            );
        }
        console.log('[Validator] Body validation successful.');
        return validationResult.data;
    };
}

// ...
