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
||@agent visual reviewed||
||@agent visual promoted||
||@agent visual memories||
||@agent visual memories: search text||
||@agent visual context||
||@agent visual show||
||@agent visual show: request-id||
||@agent visual note: note text||
||@agent visual note: request-id | note text||
||@agent visual review: state | note text||
||@agent visual review: request-id | state | note text||
||@agent visual promote||
||@agent visual promote: request-id | note text||
||@agent visual remember||
||@agent visual remember: request-id | note text||
||@agent visual cancel||
||@agent visual cancel: request-id||
||@agent visual retry||
||@agent visual retry: request-id||
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
* `visual reviewed` : Show recent local visual requests with human review decisions.
* `visual promoted` : Show recent local visual requests marked as promotion candidates.
* `visual memories` : Show recent remembered visual guidance.
* `visual memories: search text` : Search remembered visual guidance by simple local text match.
* `visual context` : Show remembered visual guidance that can enter hidden context.
* `visual show` : Show compact details and recent notes for the latest local visual request.
* `visual show: request-id` : Show compact details and recent notes for a specific local visual request.
* `visual note: note text` : Attach a human note to the latest local visual request.
* `visual note: request-id | note text` : Attach a human note to a specific local visual request.
* `visual review: state | note text` : Review the latest local visual request.
* `visual review: request-id | state | note text` : Review a specific local visual request.
* `visual promote` : Mark the latest local visual request as a promotion candidate without moving files.
* `visual promote: request-id | note text` : Mark a specific local visual request as a promotion candidate without moving files.
* `visual remember` : Remember the latest local visual request as durable visual guidance without moving files.
* `visual remember: request-id | note text` : Remember a specific local visual request as durable visual guidance without moving files.
* `visual cancel` : Cancel the latest queued local visual request without deleting files.
* `visual cancel: request-id` : Cancel a specific queued local visual request without deleting files.
* `visual retry` : Clone the latest retryable failed/cancelled request into a new queued request.
* `visual retry: request-id` : Clone a specific failed/cancelled request into a new queued request.
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

For `visual reviewed`, expected response:

```text
reviewed visual requests:
* request-id : usable : Keep the sleepy expression.
```

For `visual promoted`, expected response:

```text
promoted visual requests:
* request-id : promote_candidate : Good likeness direction.
```

For `visual memories`, expected response:

```text
visual memories:
* memory-id : self : Good likeness direction.
```

For `visual memories: soft portrait`, expected response:

```text
visual memories for: soft portrait
* memory-id : self : Good likeness direction.
```

For `visual context`, expected response:

```text
Remembered visual guidance:
* self / self-portrait : Good likeness direction.
```

For `visual show`, expected response:

```text
visual request:
id: request-id
status: queued
type: dream
prompt_path: prompts/request-id.md
reviews:
* 2026-06-13T00:00:00.000Z : note : Keep the sleepy expression.
```

For `visual note`, expected response:

```text
visual request noted
id: request-id
```

For `visual review`, expected response:

```text
visual request reviewed
id: request-id
state: usable
```

For `visual promote`, expected response:

```text
visual request marked for promotion
id: request-id
state: promote_candidate
```

For `visual remember`, expected response:

```text
visual request remembered
id: request-id
memory: memory-id
```

Supported review states:

* usable
* promote_candidate
* needs_edit
* rejected
* blocked

For `visual cancel`, expected response:

```text
visual request cancelled
id: request-id
```

For `visual retry`, expected response:

```text
visual request retry queued
id: new-request-id
retry_of: old-request-id
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
