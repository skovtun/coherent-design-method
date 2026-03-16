/**
 * Structured Logging
 *
 * Logger utility for CLI output.
 * This will be implemented in Task 1.2
 */

export const logger = {
  info: (message: string) => console.log(message),
  error: (message: string) => console.error(message),
  warn: (message: string) => console.warn(message),
}
