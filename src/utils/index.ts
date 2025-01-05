import { DexterityError } from "../types";

/**
 * Helper functions for error handling
 */
export const ErrorUtils = {
  /**
   * Creates a DexterityError with the given code and message
   */
  createError(code: number, message: string, details?: any): DexterityError {
    const error = new Error(message) as DexterityError;
    error.code = code;
    error.details = details;
    return error;
  },
};
