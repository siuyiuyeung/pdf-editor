class JobError(Exception):
    """A conversion failure with a client-facing code (TIMEOUT, CONVERSION_FAILED, ENCRYPTED, BAD_OPTIONS)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
