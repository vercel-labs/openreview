# Contributing to OpenReview

Thank you for your interest in contributing to OpenReview! This document provides guidelines and instructions for contributors.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Contributing Guidelines](#contributing-guidelines)
- [Adding Skills](#adding-skills)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Code of Conduct](#code-of-conduct)

## Getting Started

OpenReview is an open-source AI code review bot. Before contributing, familiarize yourself with the project by reading the [README.md](README.md).

### Prerequisites

- Node.js 18+ or Bun
- Git
- A GitHub account

## Development Setup

1. **Fork and Clone the Repository**

   ```bash
   git clone https://github.com/your-username/openreview.git
   cd openreview
   ```

2. **Install Dependencies**

   ```bash
   bun install
   # or npm install
   ```

3. **Set Up Environment Variables**

   Create a `.env.local` file with the following (for local development):

   ```env
   ANTHROPIC_API_KEY=your_anthropic_key
   GITHUB_APP_ID=your_app_id
   GITHUB_APP_INSTALLATION_ID=your_installation_id
   GITHUB_APP_PRIVATE_KEY=your_private_key
   GITHUB_APP_WEBHOOK_SECRET=your_webhook_secret
   REDIS_URL=your_redis_url  # Optional
   ```

4. **Run the Development Server**

   ```bash
   bun dev
   # or npm run dev
   ```

   The app will be available at `http://localhost:3000`.

5. **Lint and Format Code**

   ```bash
   bun run check  # Lint
   bun run fix    # Fix linting issues
   ```

## Project Structure

```
openreview/
├── app/                 # Next.js app directory
├── lib/                 # Core logic (agent, bot, tools, etc.)
├── workflow/            # Vercel Workflow steps
├── .agents/skills/      # Review skills
├── components.json      # UI component config
├── package.json         # Dependencies and scripts
└── README.md            # Project documentation
```

## Contributing Guidelines

- **Code Style**: Follow the existing code style. Use TypeScript, and ensure code is linted with `oxlint` and formatted with `oxfmt`.
- **Commits**: Write clear, concise commit messages. Use conventional commits if possible (e.g., `feat: add new skill`).
- **Pull Requests**: 
  - Create a feature branch from `main`.
  - Ensure tests pass and code is linted.
  - Provide a clear description of changes.
  - Reference any related issues.
- **Issues**: Check existing issues before creating new ones. Use labels appropriately.

## Adding Skills

Skills are specialized review instructions loaded dynamically. To add a new skill:

1. Create a new folder in `.agents/skills/` (e.g., `my-skill/`).
2. Add a `SKILL.md` file with YAML frontmatter:

   ```markdown
   ---
   name: my-skill
   description: Brief description of when to use this skill.
   ---

   # My Skill

   Detailed instructions for the AI agent...
   ```

3. Test the skill by triggering a review with relevant context.

See the [README.md](README.md#skills) for more details.

## Testing

Currently, the project does not have automated tests. Contributions to add tests are highly encouraged!

- **Manual Testing**: Test features locally by running the dev server and simulating reviews.
- **Future**: We plan to add unit tests for tools and integration tests for workflows.

## Submitting Changes

1. Ensure your changes are tested and linted.
2. Push your branch to your fork.
3. Create a Pull Request on the main repository.
4. Wait for review and address any feedback.

## Code of Conduct

This project follows a code of conduct to ensure a welcoming environment. Be respectful and inclusive in all interactions.

For questions, open an issue or discuss on GitHub Discussions.

Happy contributing! 🚀