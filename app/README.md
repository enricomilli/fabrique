Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
npm install
npm run dev
```

## Docker

Start the local PostgreSQL, SeaweedFS, and Redis services from `app/`:

```bash
docker compose -f infra/compose.dev.yaml up -d
```

Stop the services from `app/`:

```bash
docker compose -f infra/compose.dev.yaml down
```

The Compose project name stays `app` to preserve the default volume names.
Do not add `-v` unless you want to delete the service data.

Build the production image from the repository root:

```bash
docker build -f app/infra/Dockerfile -t fabrique .
```

Keep the repository root as the build context for the app, document exports, and PDFs.

### Production Compose

`infra/compose.prod.yaml` runs the web app, fake worker, PostgreSQL, Redis, SeaweedFS, and migrations.
The production project uses separate volumes from development.
The services do not publish host ports. The web app exposes port `3000` on the container network.
In Dokploy, add a domain for the `web` service with container port `3000` and HTTPS enabled.
Set `SERVER_URL` to that domain's HTTPS URL.
Let Dokploy configure Traefik. Do not add a host port mapping for the web app.
Configure Traefik to permit PDF uploads up to 1.5 GB.

Create the production environment file from `app/`:

```bash
cp infra/.env.prod.example .env.prod.local
```

Set the public `SERVER_URL` and the secrets in `.env.prod.local`.
Generate each secret separately with `openssl rand -hex 32`.
Use a hexadecimal PostgreSQL password because Compose inserts it into the database URL.
Do not commit the environment file.

Start the services from `app/`:

```bash
docker compose --env-file .env.prod.local -f infra/compose.prod.yaml up -d --build
```

The migration container applies migrations and seeds the saved documents before the web app and worker start.
Keep `explorer/` and `data/pdf/` available as read-only seed inputs on the deployment host.
The fake worker replays the saved CMB lensing document. It does not analyze uploaded PDFs or call a model.

Stop the services without deleting their data:

```bash
docker compose --env-file .env.prod.local -f infra/compose.prod.yaml down
```

### Database migrations

Generate and commit migration files in `app/src/db/migrations/` before you build the migration image.
Run `npm run db:generate` from `app/` to generate migration files from the schema.

Compose rebuilds the migration image on each start through `pull_policy: build`.
Docker reuses cached build layers when their inputs have not changed.
Compose runs the migration container after PostgreSQL passes its health check.
After you change migration files, start Compose from `app/`:

```bash
npm run compose:up
```

Check the migration result from `app/`:

```bash
docker compose -f infra/compose.dev.yaml logs migrations
docker compose -f infra/compose.dev.yaml ps -a migrations
```

The migration container exits with code zero on success and a nonzero code on failure.

Build the migration image separately from the repository root:

```bash
docker build -f app/infra/Dockerfile.migrations -t fabrique-migrations .
```

Set `DATABASE_URL` in your shell to a database that the container can reach.
Apply all pending migrations:

```bash
docker run --rm -e DATABASE_URL fabrique-migrations
```

The migration image needs only `DATABASE_URL`, not the application secrets.
Run one migration container at a time before you deploy the application.
Do not configure an automatic restart for this container.

For a separate deployment job, use `app/infra/Dockerfile.migrations`, context `.`, and an empty build stage.
The application uses `app/infra/Dockerfile` with an empty build stage or `runtime`.

# Building For Production

To build this application for production:

```bash
npm run build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Remove `@tailwindcss/vite` and `tailwindcss` from `package.json`

## Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The following scripts are available:


```bash
npm run lint
npm run format
npm run check
```


## Deploy with Nitro

This project uses Nitro as a generic server adapter, so it can run on any Node-compatible host.

```bash
npm run build
node dist/server/index.mjs
```

The build output is a self-contained Node server. To deploy, push the `dist/` directory to your host (Render, Fly.io, your own VPS, etc.) and run the server command above.

For host-specific presets (Vercel, Netlify, Cloudflare, AWS Lambda, etc.) and tuning, see https://v3.nitro.build/deploy.


## Setting up PostHog

1. Create a PostHog account at [posthog.com](https://posthog.com)
2. Get your Project API Key from [Project Settings](https://app.posthog.com/project/settings)
3. Set `VITE_POSTHOG_KEY` in your `.env.local`

### Optional Configuration

- `VITE_POSTHOG_HOST` - Set this if you're using PostHog Cloud EU (`https://eu.i.posthog.com`) or self-hosting


## T3Env

- You can use T3Env to add type safety to your environment variables.
- Add Environment variables to the `src/env.mjs` file.
- Use the environment variables in your code.

### Usage

```ts
import { env } from "#/env";

console.log(env.VITE_APP_TITLE);
```






## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).



# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).

## Languages

The app supports English at `/en/` and French at `/fr/` through Paraglide JS.
The URL takes priority over the language cookie, browser language, and English fallback.
The language selector saves a cookie and loads the localized page.
It preserves the current path, search parameters, and hash.
A language change reloads the document to keep server and browser output consistent.

Translation files live in `messages/en.json` and `messages/fr.json`.
Use complete messages with named parameters, such as `{file}`.
Use `Intl` with `getLocale()` for dates and numbers.
Keep the interface language separate from document and generated output languages.

Vite generates typed message functions in `src/paraglide/` during development and builds.
Do not edit or commit generated files.
Run `npm run build` before a standalone TypeScript check on a new checkout.
The first build needs network access to download the Inlang message plugin.

To add a language:

1. Add its code to `config/i18n.inlang/settings.json`.
2. Add a matching translation file in `messages/`.
3. Add its URL pattern in `vite.config.ts`.
4. Add its option to the language selector in `src/routes/index.tsx`.
5. Extend `tests/i18n.test.mjs` with its expected translations.
6. Run `npm run test:i18n`.

The server middleware keeps each request's language separate.
API routes, server functions, and built assets bypass localization through `routeStrategies` in `vite.config.ts`.
Add other backend paths to both `routeStrategies` and `urlPatterns` when necessary.
Do not publicly cache preference-based redirects without cookie-aware cache rules.

### Sources

- [Paraglide integration for TanStack Start](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/tanstack-start)
- [TanStack Start example](https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide)

## Feedback backend

Set `DISCORD_FEEDBACK_WEBHOOK_URL` in the server environment or `.env.local`.
Use `.env.example` as a template.
Do not add a `VITE_` prefix or commit the webhook URL.
The server reads this secret through `process.env`.

Import `submitFeedback` from `src/lib/feedback-fns.ts`.
Call `submitFeedback({ data: { email, message } })` to send feedback through POST.
This function does not require authentication.

The shared `feedbackSchema` export lives in `src/lib/feedback-schema.ts`.
It trims both fields.
The email must be valid and contain at most 254 characters.
The message must contain 1–2,000 characters after trimming.
Field validation uses `invalid_email` and `invalid_message` error codes.

The result is `{ success: true }` or `{ success: false, error }`.
The error is `invalid_input`, `unavailable`, or `send_failed`.
A missing webhook URL returns `unavailable`.
Discord failures and the eight-second timeout return `send_failed`.
Results do not expose the webhook URL or Discord response details.
Discord receives the email and raw message without added quotes.
The payload disables automatic mentions with `allowed_mentions: { parse: [] }`.

Run backend tests with Node 24:

```bash
node --test tests/feedback.test.ts
```

The tests use a mock transport and do not send Discord requests.

The header links to `/en/feedback` or `/fr/feedback` based on the current language.
The feedback page translates labels, validation errors, and submission results.
Failed submissions keep the email and message for another attempt.
Apply rate limits at the hosting layer before you expose this unauthenticated endpoint publicly.

## Document reader

Document cards open `/documents/<id>` with a choice of summary sheet or reading note.
The cards link to separate `/documents/<id>/fiche` and `/documents/<id>/note` pages.
Both pages use the shared `_reader` layout. The selection page contains no reader logic.
The interface supports English and French. Source content keeps its original language.

All application pages require a session, except `/login`.
The server reads documents from PostgreSQL and validates completed payloads with Zod.
My documents includes the signed-in user's public and private documents.
Public documents includes all public documents. Both lists exclude deleted documents.
Document pages and PDFs permit the owner or a signed-in reader of a public document.

The seed script reads `../explorer/<id>/data.json` and uploads `../data/pdf/<id>.pdf` to the configured S3 bucket.
Run `npm run db:seed` after database migrations.
Use `EXPLORER_DIR` and `PDF_DIR`, or the seed path options, to change the source directories.
These local directories are seed inputs, not runtime data sources.

The server streams S3 objects at `pdfs/<id>.pdf` through `/api/pdfs/<id>` with byte-range support.
Configure the database and S3 connection through the server variables in `.env.example`.
The runtime image does not contain the original JSON or PDF files.

An optional top-level `pdf_url` in the document payload overrides the S3 PDF link.
Use an absolute HTTP or HTTPS URL for the matching original PDF.
If neither source exists, the page shows an unavailable message instead of a broken link.

### Academic paper uploads

Select the plus card in My documents to open `/documents/new`.
Submit a PDF up to 1,500,000,000 bytes (1.5 GB). New documents are private unless you enable the public switch.
The server streams the PDF to S3 with bounded memory and queues a BullMQ job in Redis.
Set `REDIS_URL` to `redis://localhost:6379` for local development.
Configure deployment proxies to permit this upload size and enough transfer time.

`generation_completed` defaults to false for uploads. Migrations do not mark documents complete.
Seeds mark a document complete only when its validated payload contains both fiche and note Markdown.
The application shows generation progress while the worker fills the document payload.
The fake worker app at `workers/fake-generation` replays the saved `daley_thesis` document without model calls.
It requires an explicit demo setting. Do not use it with a real worker on the same queue.
See `workers/fake-generation/README.md` for the install and start commands.

The queue name is `document-generation`. The job name is `generate-document`.
The job ID is the document ID. The payload contains `documentId`, `userId`, `bucket`, and `key`.
A worker must validate the generated payload and save it before it sets `generation_completed` to true.
A worker must check ownership and deletion before work. Retries must not duplicate completed work.

If Redis fails after an upload, the endpoint returns 503 with the saved document ID.
The row and PDF remain because Redis might have accepted the job before the connection failed.
Recovery must enqueue the same document ID. Automatic recovery is not implemented yet.

### End-to-end checks

Run `npm run test:e2e` with local PostgreSQL, S3, and Redis services available.
Install the fake worker dependencies with `npm ci --prefix workers/fake-generation` before the checks.
The checks start the built application and create temporary users and documents.
They send real HTTP requests and check uploads, authorization, PDF downloads, and generation progress.
The generation check starts the fake worker on a separate test queue.
The checks delete their test rows, S3 objects, and queue jobs afterward.
