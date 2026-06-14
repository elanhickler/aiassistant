# Visual Pipe Commands

Visual pipe commands are the future manual control surface for visual expression.

These commands are partially wired into the Discord runtime when the optional `visualexpression` skill is enabled.

Current implementation queues local request JSON and request log entries. It does not generate images yet.

## Command Shape

In servers, use the agent name.

```text
||@agent visual||
||@agent visual: prompt text||
||@agent visual scene: prompt text||
||@agent visual emoji: prompt text||
||@agent visual self: prompt text||
||@agent visual background: prompt text||
||@agent visual thought: prompt text||
||@agent visual dream: prompt text||
||@agent visual requests||
||@agent visual process||
```

In DMs, `@agent` may be optional when the runtime already knows which agent is being addressed.

## Behavior

* `visual` : Ask the agent to choose the output type from current context.
* `visual: text` : Ask the agent to choose the output type using the text as guidance.
* `visual scene: text` : Request a scene image.
* `visual emoji: text` : Request a small expression or symbol image.
* `visual self: text` : Request an image of the agent.
* `visual background: text` : Request an environment or location image.
* `visual thought: text` : Request an internal or symbolic image.
* `visual dream: text` : Request a dream image. This should usually require sleep or dream context.
* `visual requests` : Show recent local visual requests and statuses.
* `visual process` : Process queued local visual requests as far as the current implementation can. Right now this records a provider-unimplemented failure instead of generating an image.

## Output

The current implementation creates a local visual request, not an image.

Expected response:

```text
visual request queued
```

For `visual process`, expected response:

```text
visual request processor checked 1 queued request
```

For `visual requests`, expected response:

```text
visual requests:
* request-id : queued : dream : blue hallway dream
```

The request should then follow:

* `docs/visual-expression-request.md`
* `docs/visual-request-lifecycle.md`
* `docs/visual-reference-selection.md`
* `docs/visual-prompt-assembly.md`
* `docs/visual-output-manifest.md`

## Boundaries

* Do not add slash commands for this first.
* Do not post generated images to Discord by default.
* Do not add command aliases.
* Do not add the command text itself to shortmemory.
* Do not let visual commands bypass local safety, storage, or attribution rules.
