# @botanarede/beddel

OpenClaw plugin for the [Beddel](https://github.com/botanarede/beddel) workflow engine.

Registers the `beddel` tool, enabling the OpenClaw agent to execute, validate, and inspect declarative YAML AI workflows.

## Install

```bash
openclaw plugins install @botanarede/beddel
```

## Prerequisites

Beddel CLI must be installed:

```bash
python3.11 -m pip install "beddel[all]"
```

## Actions

| Action | Description |
|--------|-------------|
| `run` | Execute a workflow YAML file |
| `validate` | Validate workflow YAML syntax |
| `list-primitives` | Show available workflow primitives |

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultTimeoutMs` | number | 120000 | Process timeout in ms |
| `maxStdoutBytes` | number | 1048576 | Max stdout capture (1MB) |
| `beddelPath` | string | `beddel` | Custom path to beddel CLI |
| `jsonOutput` | boolean | true | Use --json-output for run |

## License

MIT
