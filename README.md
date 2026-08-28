# vitto

Vitto is a pet-centered social fitness game: your real-life care becomes your pet's energy, mood, and growth.

## Run the MVP

```bash
npm install
npm run dev
```

The current vertical slice is local-first so it can be tried without accounts or backend credentials:

`adopt pet -> log workout / sync mock steps / add meal -> pet state and reaction update`

## Supabase setup

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Run `supabase/schema.sql` in the Supabase SQL editor.

### Gemini meal analysis

Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey), then set it as a Supabase Edge Function secret and deploy the function:

```bash
supabase secrets set GEMINI_API_KEY=your-key
supabase functions deploy analyze-meal
```

The key must not be added to `VITE_*` variables. Gemini availability and limits depend on the current free-tier terms and region.

The Supabase client and repository are ready for the auth and database wiring. Until those environment variables are present, the browser demo continues using local storage.

## Architecture

- `src/domain/health.ts`: versionable `HealthEvent` contract and metadata types.
- `src/domain/petHealthEngine.ts`: pure event-to-pet rules; health inputs never couple directly to a provider.
- `src/services/healthDataProvider.ts`: provider boundary, currently backed by mock steps.
- `src/services/localRepository.ts`: temporary browser persistence, replaceable with Supabase repositories.
- `src/App.tsx`: pet-first home screen and vertical slice orchestration.

## Product architecture

The planned production stack is Expo + React Native + TypeScript for iOS/Android, Supabase Auth/Postgres/Storage/Realtime, and an API-side meal vision service behind an `MealAnalysisProvider` interface. Supabase Row Level Security should protect user, pet, health event, meal image, friendship, and challenge rows. Health data and meal images are sensitive: collect only what the feature needs, use private storage paths, short-lived signed URLs, deletion/export controls, and explicit consent for HealthKit/Health Connect.

The next dependency-ordered slices are authentication and Supabase schema, meal capture and AI classification, friendships and pet-event reactions, then cooperative challenges. Sleep, screen time, automatic health imports, monetization, and harsh neglect states remain intentionally deferred.
