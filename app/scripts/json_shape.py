#!/usr/bin/env python3
"""Print JSON keys and types without field values."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Union, cast

JSONValue = Union[None, bool, int, float, str, list["JSONValue"], dict[str, "JSONValue"]]


@dataclass
class Shape:
    types: set[str] = field(default_factory=set)
    keys: dict[str, Shape] = field(default_factory=dict)
    items: Shape | None = None

    def add(self, value: JSONValue) -> None:
        if isinstance(value, dict):
            self.types.add("object")
            for key, child in value.items():
                self.keys.setdefault(key, Shape()).add(child)
        elif isinstance(value, list):
            self.types.add("array")
            if value and self.items is None:
                self.items = Shape()
            for item in value:
                assert self.items is not None
                self.items.add(item)
        elif value is None:
            self.types.add("null")
        elif isinstance(value, bool):
            self.types.add("boolean")
        elif isinstance(value, int):
            self.types.add("integer")
        elif isinstance(value, float):
            self.types.add("number")
        else:
            self.types.add("string")

    def lines(self, label: str = "root", depth: int = 0) -> list[str]:
        result = [f"{'  ' * depth}{label}: {' | '.join(sorted(self.types))}"]
        for key, child in sorted(self.keys.items()):
            result.extend(child.lines(json.dumps(key, ensure_ascii=False), depth + 1))
        if self.items is not None:
            result.extend(self.items.lines("[]", depth + 1))
        return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="Path to the JSON file.")
    args = parser.parse_args()
    path = cast(Path, args.path)
    try:
        with path.open(encoding="utf-8-sig") as source:
            value = cast(JSONValue, json.load(source))
    except (OSError, UnicodeError, ValueError) as error:
        parser.exit(1, f"Cannot read JSON file: {error}\n")

    shape = Shape()
    shape.add(value)
    print("\n".join(shape.lines()))


if __name__ == "__main__":
    main()
