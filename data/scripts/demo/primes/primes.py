#!/usr/bin/env -S uv run --with rich --quiet
# /// script
# requires-python = ">=3.10"
# dependencies = ["rich"]
# ///
"""Sieve of Eratosthenes, printed as columns with rich."""

from rich.console import Console
from rich.columns import Columns
from rich.panel import Panel

LIMIT = 200

console = Console(force_terminal=True, width=88)


def sieve(limit: int) -> list[int]:
    flags = [True] * (limit + 1)
    flags[0] = flags[1] = False
    for n in range(2, int(limit**0.5) + 1):
        if flags[n]:
            for m in range(n * n, limit + 1, n):
                flags[m] = False
    return [i for i, ok in enumerate(flags) if ok]


primes = sieve(LIMIT)

console.print(Panel(f"{len(primes)} primes below {LIMIT}", style="bold cyan", expand=False))
console.print(Columns([f"[green]{p}[/green]" for p in primes], equal=True, expand=False))
