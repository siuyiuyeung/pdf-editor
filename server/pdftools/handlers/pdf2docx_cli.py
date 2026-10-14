"""Runs pdf2docx in a child process so the worker can kill it on timeout."""

import sys

from pdf2docx import Converter


def main(src: str, dst: str) -> None:
    converter = Converter(src)
    try:
        converter.convert(dst)
    finally:
        converter.close()


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
