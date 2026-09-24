# RailCtrl

RailCtrl is a bilingual web application for coordinating railway station and field operations. It brings operational records, staff tools, schedules, reference information, and administrative workflows together in one authenticated application.

## Product overview

RailCtrl currently includes the following areas:

- **Home and navigation** — a role-aware entry point to available operational tools.
- **Problem records** — create, review, search, and manage reported operational or equipment issues.
- **Work permits** — record and track field work, including work details, staff, station, and status.
- **Shift planning** — view and manage monthly station rosters and staffing information.
- **Lost property** — maintain lost-and-found records and their handover status.
- **Staff operations** — shortcuts to frequently used staff and organizational tools.
- **Notes** — keep internal reference notes, procedures, and other staff information.
- **Extensions and reference pages** — access internal phone numbers, train schedules, route information, and administrative reference material.
- **Leave requests** — submit and review staff leave requests and related information.
- **Administration** — manage staff accounts, review audit records and feedback, and access administrative reports and file workflows.

The interface supports Turkish and English, with theme preferences available through the application shell. Access to pages and API operations depends on the authenticated user's role.

## Technology

- [Astro](https://astro.build/) 7 with server-rendered output
- [`@astrojs/node`](https://docs.astro.build/en/guides/integrations-guide/node/) standalone Node.js adapter
- Astro DB backed by SQLite for application data
- TypeScript for browser-side application modules and server code
- `bcryptjs` for password hashing
- Node.js cryptography for signed sessions and AES-256-GCM encrypted file content

The application serves its API from Astro endpoints under `src/pages/api/`. The Node adapter is configured to listen on `0.0.0.0`; the default port is `3000` and can be changed with `PORT`.

## Requirements

- Node.js `>=22.12.0`
- npm (use the version bundled with a supported Node.js installation)

Check your installed versions:

```bash
node --version
npm --version
```

If you use [nvm](https://github.com/nvm-sh/nvm), install and select a compatible Node.js version:

```bash
nvm install 22
nvm use 22
```

## Getting started

Clone the repository, install the locked dependencies, configure the encryption key, and start the development server:

```bash
git clone <repository-url>
cd railctrl-main
npm ci
cp .env.example .env
```

Set `ENCRYPTION_KEY` in `.env` to a private key value, then run:

```bash
npm run dev
```

Open <http://localhost:3000> in your browser. There is no public self-registration flow: user accounts are managed through the administrator workflow. Sign in with an account provisioned for your installation.

### Environment variables

| Variable | Required | Description |
|---|---:|---|
| `ENCRYPTION_KEY` | Yes for encrypted file operations | Secret used to derive the AES-256-GCM encryption key. Keep it private and preserve it with encrypted data backups. |
| `PORT` | No | HTTP port for the development and preview servers. Defaults to `3000`. |
| `RAILCTRL_SESSION_KEY_FILE` | No | Optional path for the 32-byte session-signing key. Defaults to `.astro/session.key` in the application directory. |
| `PUBLIC_ASSET_VERSION` | No | Optional explicit identifier for versioning client assets. |
| `RAILCTRL_BUILD_ID` | No | Fallback build identifier when `PUBLIC_ASSET_VERSION` is not set. |

Generate a high-entropy encryption key rather than using the example value:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The application derives a 32-byte AES key from the configured value, so a securely generated random value is suitable. Never commit `.env`, session keys, production database files, or backups. Losing or changing the encryption key can make previously encrypted file content unreadable. The session-signing key is created automatically on first use; preserve it when continuity of existing sessions is required, and restrict access to the file.

## Development and production commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local development server with Astro's development workflow. |
| `npm run build` | Build the standalone Node server and client assets into `dist/`. The build uses a separate Astro database file at `.astro/build.db`. |
| `npm run preview` | Serve the production build locally for a smoke check. |

For example, to build and preview:

```bash
npm run build
npm run preview
```

The preview server uses `PORT` when provided; otherwise its configured port is `3000`. Confirm the startup address printed in the terminal.

## Data, storage, and backups

Astro DB stores local application data in the Astro project data directory. The development database and generated files live under `.astro/`; the production build command explicitly uses `.astro/build.db` to keep build-time database output separate from the usual development database. The location and lifecycle of runtime data can depend on how the standalone server is started and configured.

Treat database files as application data, not disposable build output. Before upgrading, moving, or cleaning an installation:

1. Stop the running application.
2. Make a verified backup of the database and any separately stored uploads or attachments.
3. Preserve the matching `ENCRYPTION_KEY` and, if you need existing sessions to remain valid, the session-signing key.
4. Store backups outside the repository in a restricted location and test that they can be restored.

Do not delete `.astro/content.db` as a generic troubleshooting step: doing so may remove local application data. This repository does not include a universal backup/restore command; deployments should document and test procedures that match their runtime storage configuration.

## Roles and access

The application has two current roles:

- **Personnel (`personel`)** — access to standard staff and operational workflows allowed for the account.
- **Administrator (`yonetici`)** — access to administrative workflows, including staff-account management and other protected administration features.

Authentication and authorization are enforced by the server for protected pages and API endpoints. Assign accounts and roles only through the authorized administrative process. Do not rely on hiding a navigation link as an access-control mechanism.

## Internationalization

The interface offers Turkish and English. English translations are maintained in `src/i18n/en.ts`; Turkish strings are maintained in `src/i18n/tr.ts`. Shared language selection and DOM localization behavior live in `src/scripts/localization.ts`. User-entered content is not translated automatically.

## Repository map

```text
src/
├── components/     Shared UI components
├── i18n/           Turkish and English translation dictionaries
├── layouts/        Shared page shells and layouts
├── lib/            Authentication, database, encryption, audit, and domain utilities
├── pages/          Server-rendered application pages and API routes
│   └── api/        HTTP API endpoints grouped by feature
├── scripts/        Browser-side TypeScript modules
└── middleware.ts   Request middleware and shared request setup
public/             Static assets, stylesheets, icons, and service-worker files
astro.config.mjs    Astro server, adapter, database, and build configuration
.env.example        Environment-variable template
package.json        Project scripts and dependency manifest
package-lock.json   Reproducible npm dependency lockfile
```

## Troubleshooting

| Symptom | Suggested checks |
|---|---|
| `astro: command not found` | Install dependencies in the repository with `npm ci`, then run the project script (`npm run dev` or `npm run build`). Avoid relying on a globally installed Astro CLI. |
| Unsupported Node.js version | Check `node --version` and use Node.js `22.12.0` or newer. |
| Port is already in use | Start with another port, for example `PORT=3001 npm run dev`. |
| Encrypted file operation fails | Confirm that `ENCRYPTION_KEY` is configured and matches the key used when the content was encrypted. |
| Session validation fails after moving the installation | Confirm that the configured session key file is present and readable, or set `RAILCTRL_SESSION_KEY_FILE` to its preserved location. |
| Database or migration error | Stop the server and make a backup before investigating. Review the terminal error and verify that the runtime can read and write its configured Astro DB storage. Do not delete database files before confirming the data is backed up. |
| Dependency installation is inconsistent | Run `npm ci` from the repository root to install versions recorded in `package-lock.json`. |

## License

This project is licensed under the **GNU Affero General Public License, version 3 only (AGPL-3.0-only)**. See [`LICENSE`](./LICENSE) for the complete license text. If you modify the application and make it available for network use, the AGPL's corresponding-source requirements apply to those users.

## Contributing and verification

- Keep changes focused on the current application and its documented behavior.
- Run `npm run build` after changes that affect application code or Astro configuration.
- Do not commit secrets, local databases, session keys, or operational backups.
- Preserve the lockfile when changing npm dependencies.
