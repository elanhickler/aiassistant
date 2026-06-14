# Speak Skill

The speak skill is the text-to-speech and voice-training capability layer.

Discord is only one interface for this skill. A local app, website, Yculth page, or future API server should be able to call the same underlying skill hooks.

## Commands

Generate speech from text:

```text
||@agent speak: text to speak||
```

Train or clone a voice model from an attached audio file, or by replying to a message with an audio attachment:

```text
||@agent speak: train voice title | exact transcript | optional description||
```

`clone` and `upload voice` are accepted as natural variants of `train`.

## Hooks

The skill exposes implementation hooks:

* `generateSpeech({ text, referenceId })` : Generate audio from text and save it under the agent's regenerated speak folder.
* `trainVoiceModel({ title, transcript, description, attachment })` : Upload an audio sample to the provider and log the returned voice model metadata.

Discord currently calls those hooks from pipe commands. Other interfaces should call the hooks directly or through a future local API instead of reimplementing provider logic.

## Provider

The first provider is Fish Audio.

Fish Audio uses:

* `/v1/tts` : Generate speech.
* `/model` : Create a persistent cloned voice model from uploaded audio.

The generated cloned voice id can later be used as `reference_id` for speech generation.

## Storage

Generated audio and voice model logs are stored under:

```text
agents/<Agent>/regenerated/speak/
```

Current default files:

```text
generated/
voice-models.jsonl
```

Secrets stay in:

```text
agents/<Agent>/secrets/fish_audio_api_key.txt
```

## Boundary

The speak skill should not assume Discord is the permanent interface.

Keep provider behavior in the skill. Keep interface behavior at the edge.

Do not store provider API keys in settings. Do not commit generated audio, cloned voices, or secrets unless the user explicitly chooses to do so.
