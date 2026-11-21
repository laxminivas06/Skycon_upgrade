"""
SKYCON System — Production Logging Configuration
"""

import os
import logging
from logging.handlers import RotatingFileHandler
from backend.settings import settings


def setup_logging(app_name: str = "skycon") -> logging.Logger:
    """Configures console and rotating file logging."""
    os.makedirs(settings.LOG_DIR, exist_ok=True)
    log_file = os.path.join(settings.LOG_DIR, f"{app_name}.log")

    logger = logging.getLogger(app_name)
    logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    if not logger.handlers:
        formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )

        # Console handler
        ch = logging.StreamHandler()
        ch.setLevel(logging.INFO)
        ch.setFormatter(formatter)
        logger.addHandler(ch)

        # Rotating file handler (5 MB max, 3 backups)
        try:
            fh = RotatingFileHandler(log_file, maxBytes=5 * 1024 * 1024, backupCount=3)
            fh.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
            fh.setFormatter(formatter)
            logger.addHandler(fh)
        except Exception as e:
            print(f"[LOG_INIT] Warning: Could not create file handler: {e}")

    return logger
