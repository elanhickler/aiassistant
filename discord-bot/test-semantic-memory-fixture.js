import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatSemanticMemoryFilesForPrompt,
  semanticMemoryDebugEnabled,
  semanticMemoryEnabledForReplies,
  writeSemanticMemoryDebugReport,
} from "./semantic-memory.js";

const runtimeFolder = path.dirname(fileURLToPath(import.meta.url));
const fixtureFolder = path.join(runtimeFolder, "fixtures", "semantic-memory");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStringField(object, field) {
  assert(typeof object[field] === "string" && object[field].trim(), `Fixture node missing non-empty ${field}.`);
}

function assertNodeShape(node) {
  assertStringField(node, "kind");
  assertStringField(node, "compressed");
  assertStringField(node, "upscale_direction");
  assertStringField(node, "do_not_invent");
  assertStringField(node, "source");
  assert(typeof node.confidence === "number", "Fixture node confidence must be a number.");
  assert(node.confidence >= 0 && node.confidence <= 1, "Fixture node confidence must be from 0 to 1.");
}

async function main() {
  const shortMemoryPath = path.join(fixtureFolder, "shortmemory.jsonl");
  const thoughtPath = path.join(fixtureFolder, "thought.md");
  const nodePath = path.join(fixtureFolder, "expected-node.json");

  const shortMemory = await readFile(shortMemoryPath, "utf8");
  const thought = await readFile(thoughtPath, "utf8");
  const node = JSON.parse(await readFile(nodePath, "utf8"));

  assert(shortMemory.includes("\"role\":\"user\""), "Fixture must include one user message.");
  assert(shortMemory.includes("\"role\":\"assistant\""), "Fixture must include one agent reply.");
  assert(thought.includes("private first-person internal monologue"), "Fixture must include a private thought instruction.");
  assert(node.compressed.includes("Jace brought tea"), "Fixture node must preserve the emotionally important tea detail.");
  assert(node.do_not_invent.includes("stayed all night"), "Fixture node must include a forbidden invention boundary.");
  assert(node.source.includes("shortmemory.jsonl entries 0-1"), "Fixture node source must point back to the fixture range.");
  assertNodeShape(node);

  const promptPreview = formatSemanticMemoryFilesForPrompt([{
    relativeFilePath: "fixtures/semantic-memory/expected-node.jsonl",
    text: JSON.stringify(node),
  }]);
  assert(promptPreview.includes("downscaled semantic memory"), "Prompt preview must explain compressed as downscaled semantic memory.");
  assert(promptPreview.includes("do_not_invent"), "Prompt preview must include do_not_invent contract language.");

  const offSettings = { neural_memory: { mode: "off" } };
  const debugSettings = { neural_memory: { mode: "debug" } };
  const onSettings = { neural_memory: { mode: "on" } };
  assert(!semanticMemoryEnabledForReplies(offSettings), "off mode must not contribute semantic memory to replies.");
  assert(!semanticMemoryDebugEnabled(offSettings), "off mode must not create a debug report.");
  assert(!semanticMemoryEnabledForReplies(debugSettings), "debug mode must not contribute semantic memory to replies.");
  assert(semanticMemoryDebugEnabled(debugSettings), "debug mode must create an inspectable report.");
  assert(semanticMemoryEnabledForReplies(onSettings), "on mode should be the explicit reply contribution mode.");

  const tempAgentFolder = path.join(os.tmpdir(), `aiassistant-semantic-fixture-${Date.now()}`);
  await mkdir(tempAgentFolder, { recursive: true });
  const report = await writeSemanticMemoryDebugReport({
    agentFolder: tempAgentFolder,
    agentName: "FixtureAgent",
    currentUserContent: "The storm is loud. Do you remember the tea?",
    recentShortMemory: shortMemory,
    semanticMemoryFiles: [{
      relativeFilePath: "fixtures/semantic-memory/expected-node.jsonl",
      text: JSON.stringify(node),
    }],
  });
  const reportText = await readFile(report.latestPath, "utf8");
  assert(reportText.includes("Jace brought tea"), "Debug report must include downscaled meaning.");
  assert(reportText.includes("upscale_direction"), "Debug report must include upscale_direction.");
  assert(reportText.includes("Do not invent"), "Debug report must include do_not_invent material.");
  assert(report.selectedCount === 1, "Debug report should select the fixture node.");
  await rm(tempAgentFolder, { recursive: true, force: true });

  console.log("semantic memory fixture test passed");
}

main().catch((error) => {
  console.error(`semantic memory fixture test failed: ${error.message}`);
  process.exitCode = 1;
});
