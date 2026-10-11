# Video Commerce AI Workflow

Source review draft for an AI-assisted video commerce workflow. The code models product selection, script generation, review, video project planning, and operator-controlled publishing steps. It uses typed schemas, workflow definitions, provider adapters, and local job state.

**Status:** Local prototype. This snapshot is intended for code review and testing. It is not a hosted service, and it contains no account credentials, real campaign data, media, or recorded publishing results. Live publishing and external provider calls require separate local configuration and human authorization. No production impact or revenue is claimed.

## What the code demonstrates

- Multi-step workflow orchestration with explicit inputs, outputs, and typed validation.
- AI agent and provider adapters with a deterministic echo provider for local development.
- Local job queues, state persistence, and recovery-oriented tests.
- Web workbench components for human review of generated plans and content.
- Video project structures and rendering orchestration code. Media assets and generated videos are intentionally omitted.

## Review map

| Path | Purpose |
| --- | --- |
| src/agents/ | Task-specific agents and registry |
| src/schemas/ | Zod schemas for inputs, outputs, and workflow state |
| src/workflows/ | Workflow definitions, mapping, and runner |
| src/services/ | Provider adapters, queues, evaluation, storage, and video project logic |
| src/components/ and src/app/ | Human-facing workbench |
| tests/ | Unit and contract tests using local fixtures |

The source includes integration modules, but this review snapshot does not include browser extensions, account sessions, fonts, stock media, generated output, or a deployment configuration. Some end-to-end flows therefore require resources outside this repository.

## Local verification

Requires Node.js 22 or later. From the repository directory run:

    npm ci
    npm test
    npm run check

These commands test and type-check the source. They do not publish a video or connect an account.

## Portfolio context

This project demonstrates AI workflow engineering that is relevant to remote AI agent and developer-tool roles. It is a video-commerce application, not a Web3 trading system.

## Attribution and licensing

This snapshot is derived from the owner's local Video Commerce AI workspace. Third-party package dependencies are listed in package-lock.json; no third-party media or vendored library code is included. No license grant is included in this draft. The owner should choose a license and confirm rights to every included component before making a repository public.
