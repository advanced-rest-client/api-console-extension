/* eslint-disable max-classes-per-file */
/**
 * An object describing an error during the authorization process.
 */
export class AuthorizationError extends Error {
  /**
   * @param {string} message The human readable message.
   * @param {string} code The error code
   * @param {string} state Used state parameter
   */
  constructor(message, code, state) {
    super(message);
    /** @type string */
    this.code = code;
    /** @type string */
    this.state = state;
  }
}

export class CodeError extends Error {
  /**
   * @param {string} message The human readable message.
   * @param {string} code The error code
   */
  constructor(message, code) {
    super(message);
    /** @type string */
    this.code = code;
  }
}
