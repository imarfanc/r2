#!/usr/bin/env -S uv run --with rich --quiet
# /// script
# requires-python = ">=3.10"
# dependencies = ["rich"]
# ///
"""Renders a small table of fake service stats with rich."""

import random

from rich.console import Console
from rich.table import Table

console = Console(force_terminal=True, width=88)

services = ["api-gateway", "auth", "billing", "search", "notifier", "worker-pool"]

table = Table(title="Service health", header_style="bold magenta")
table.add_column("Service", style="cyan", no_wrap=True)
table.add_column("Uptime", justify="right")
table.add_column("p95 (ms)", justify="right")
table.add_column("Status", justify="center")

for name in services:
    uptime = random.uniform(97.0, 99.999)
    p95 = random.randint(18, 420)
    ok = uptime > 99.0 and p95 < 300
    table.add_row(
        name,
        f"{uptime:.3f}%",
        str(p95),
        "[green]healthy[/green]" if ok else "[yellow]degraded[/yellow]",
    )

console.print(table)
