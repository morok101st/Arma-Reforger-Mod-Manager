"""Validate unit-bearing Workshop sizes shared by extraction and persistence."""

import math
import re


_SIZE_PATTERN = re.compile(r"([0-9]+(?:[.,][0-9]+)?)\s*(B|[KMGT]i?B)", re.IGNORECASE)


def normalize_mod_size(value: str | None) -> str | None:
    if not isinstance(value, str) or len(value) > 80:
        return None
    match = _SIZE_PATTERN.fullmatch(value.strip())
    if not match:
        return None
    number = match[1].replace(",", ".")
    unit = match[2].upper()
    exponent = 0 if unit == "B" else "KMGT".index(unit[0]) + 1
    size_bytes = float(number) * (1024 if "I" in unit else 1000) ** exponent
    if not math.isfinite(size_bytes) or size_bytes > 2**53 - 1:
        return None
    unit = unit.replace("I", "i")
    return f"{number} {unit}"
