class NREError extends Error {
  constructor(message, debug) {
    super(message);

    this.name = this.constructor.name
    this.debug = debug

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = NREError;