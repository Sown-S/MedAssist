"""Chạy worker AI:  cd server && python -m app.worker   (Ctrl+C để dừng)."""
import asyncio
import contextlib

from app.core.logging import setup_logging
from app.worker.runner import run_forever


def main() -> None:
    setup_logging()
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(run_forever())


if __name__ == "__main__":
    main()
