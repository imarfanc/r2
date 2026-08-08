#!/usr/bin/env -S uv run --with rich --quiet
# /// script
# requires-python = ">=3.10"
# dependencies = ["rich"]
# ///
"""Prints incremental progress lines — tests streaming from a Python script."""

import random
import time

from rich.console import Console

console = Console(force_terminal=True, width=88)

steps = [
    "resolving dependencies",
    "downloading artifacts",
    "compiling modules",
    "running tests",
    "packaging output",
]

console.rule("[bold cyan]build")

for i, step in enumerate(steps, 1):
    console.print(f"[dim]{i}/{len(steps)}[/dim] {step} ...", end=" ")
    time.sleep(random.uniform(0.3, 0.8))
    console.print("[green]done[/green]")

console.rule("[bold green]complete")
