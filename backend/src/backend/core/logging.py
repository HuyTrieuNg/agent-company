"""Logging configuration setup."""

import logging


def setup_logging(log_level: str = "INFO") -> None:
    """Configure root logging for the backend application."""
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        force=True,
    )
