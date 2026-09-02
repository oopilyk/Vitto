# Vitto — Claude Project Instructions

## Project Overview

Vitto is a health + virtual pet app.

The app combines:
- fitness tracking
- nutrition/macros
- gym/workout tracking
- step tracking
- screen-time related behavior
- virtual pet care
- pet stats
- pet evolution/progression
- social/community features

Healthy user behavior should improve the pet's stats and progression.

## Repository Structure

- `mobile/` — React Native / Expo mobile application
- `web/` — web application
- `packages/` — shared code, types, utilities, and components
- `supabase/` — database, migrations, functions, and backend configuration

Before making changes, inspect the relevant existing code and follow current project conventions.

## General Engineering Rules

1. Do not rewrite working code unnecessarily.
2. Prefer small, focused changes over large refactors.
3. Reuse existing components, utilities, and patterns before creating new ones.
4. Avoid adding dependencies unless there is a clear reason.
5. Preserve backward compatibility unless the task explicitly requires breaking changes.
6. Never commit secrets, private keys, service-role keys, or credentials.
7. Do not modify unrelated files.
8. Do not delete existing functionality without explicit reason.
9. Prefer strong typing and shared TypeScript types where appropriate.
10. Run relevant tests/type checks before declaring work complete.

