"""Unified exception hierarchy for the application.

All service-level errors inherit from AppError. The global exception handler
in main.py catches AppError and returns a uniform JSON response, removing the
need for try/except blocks in every endpoint.
"""


class AppError(Exception):
    """Base application error. Subclass to set the default HTTP status_code."""

    status_code: int = 400

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class NotFoundError(AppError):
    status_code = 404


class AuthenticationError(AppError):
    status_code = 401


class PermissionDeniedError(AppError):
    status_code = 403


class ConflictError(AppError):
    status_code = 409


class ValidationError(AppError):
    status_code = 422
