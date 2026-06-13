import { readFile } from "node:fs/promises";

export function parseShortMemoryEntries(text) {
  return String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function readShortMemoryEntries(shortMemoryPath) {
  const text = await readFile(shortMemoryPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });

  return parseShortMemoryEntries(text);
}

export function shortMemoryEntriesToSource(entries) {
  return entries
    .map((entry) => {
      const parts = [
        `timestamp: ${entry.timestamp || ""}`,
        `role: ${entry.role || ""}`,
        `username: ${entry.username || ""}`,
        `user_id: ${entry.user_id || ""}`,
        `channel_id: ${entry.channel_id || ""}`,
        "content:",
        entry.content || "",
      ];
      return parts.join("\n");
    })
    .join("\n\n---\n\n");
}
