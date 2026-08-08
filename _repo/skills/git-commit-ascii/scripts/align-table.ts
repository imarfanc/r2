const file = Deno.args[0];
if (!file) {
  console.error("usage: deno run -A align-table.ts <markdown-file>");
  Deno.exit(1);
}

const lines = (await Deno.readTextFile(file)).split("\n");
const output: string[] = [];
for (let index = 0; index < lines.length;) {
  if (!/^\s*\|.*\|\s*$/.test(lines[index] ?? "")) {
    output.push(lines[index] ?? "");
    index++;
    continue;
  }
  const table: string[][] = [];
  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index] ?? "")) {
    table.push((lines[index] ?? "").trim().slice(1, -1).split("|").map((cell) => cell.trim()));
    index++;
  }
  const widths = Array.from(
    { length: Math.max(...table.map((row) => row.length)) },
    (_, column) =>
      Math.max(...table.map((row) => (row[column] ?? "").replace(/^:?-+:?$/, "---").length)),
  );
  for (const [rowIndex, row] of table.entries()) {
    const cells = row.map((cell, column) => {
      if (rowIndex === 1 && /^:?-+:?$/.test(cell)) {
        return "-".repeat(Math.max(3, widths[column] ?? 3));
      }
      return cell.padEnd(widths[column] ?? cell.length);
    });
    output.push(`| ${cells.join(" | ")} |`);
  }
}
await Deno.writeTextFile(file, output.join("\n"));
