# Rill

Deploy and manage your own installation on Cloudflare Workers.

## 1. Create your accounts

You need:

- A [GitHub account](https://github.com/signup) to hold your copy of this repository.
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) to host the Worker and its D1 database.

Sign in to both accounts before continuing. This deployment runs entirely through your browser; you do not need to install development tools on your computer. Cloudflare supplies a `workers.dev` address, so you do not need to buy or connect a domain. See [Cloudflare's address documentation](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

## 2. Start the deployment

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mrtxiv/Rill)

1. Select **Deploy to Cloudflare** above.
2. Choose the Cloudflare account that will own the installation if you have more than one.
3. Connect your GitHub account when prompted. Authorize the **Cloudflare Workers & Pages** GitHub app so Cloudflare can create and build your repository. If using a GitHub organization, you may need its administrator to approve access. See [GitHub connection permissions](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/#manage-access).
4. Choose the owner and name for your new GitHub repository. Cloudflare creates the copy for you; no separate fork is needed.
5. Review the Worker name and D1 database listed in the deployment form. You can keep the suggested names or choose unused names in your account.

Cloudflare reads this repository's configuration, creates the required resources and connects them to the Worker. This is the official [Deploy to Cloudflare flow](https://developers.cloudflare.com/workers/platform/deploy-buttons/).

## 3. Check the deployment settings

Keep the detected defaults. If Cloudflare asks you to enter build settings, use:

| Setting | Value for this project |
| --- | --- |
| Root directory | Repository root (`/`) |
| Build command | Leave empty |
| Deploy command | `npm run deploy` |
| D1 database binding | `DB` — keep this exact name |
| Required variables or secrets | None for deployment and first login |

The database name can change, but the binding must remain `DB`. No manual SQL import or migration command is needed: the application creates its tables on first use.

Select **Deploy** and wait for the build and deployment to finish successfully. Cloudflare installs dependencies and runs the deployment command for you. If you need to change build settings later, open your Worker and go to **Settings → Build**. See [Cloudflare's build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## 4. Open your installation

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), open **Workers & Pages** and select your deployed Worker.
2. Open **Settings → Domains & Routes** and find its `workers.dev` address. It follows the form `https://your-worker.your-subdomain.workers.dev`. Open the actual address shown for your Worker. See [workers.dev configuration](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
3. On the first visit, create an installation account. Choose a username using 1–32 letters, numbers, dots, dashes or underscores, and a password of at least 8 characters. This account is separate from your GitHub and Cloudflare accounts.
4. Once the settings page opens, deployment is complete. Bookmark the address to return to your installation.

## If deployment fails

| Problem | Where to check |
| --- | --- |
| GitHub account or repository is unavailable | Check the Cloudflare Workers & Pages app's access in [GitHub → Settings → Applications](https://github.com/settings/installations). For an organization, ask its administrator to approve the connection. |
| Build or deployment fails | Open the failed build from your Worker's **Deployments** tab and read the error log. Confirm the settings above. Cloudflare's [build troubleshooting guide](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/) covers common errors. |
| **Durable storage is not configured** | Open your Worker's **Bindings** tab and check that a D1 database is connected as `DB`. If missing, use **Add binding → D1 database**, enter `DB` as the variable name, and select the database created for this installation. See [Cloudflare's D1 binding instructions](https://developers.cloudflare.com/d1/get-started/#3-bind-your-worker-to-your-d1-database). |
| The deployed address does not open | Confirm deployment succeeded and that the `workers.dev` route is enabled under **Settings → Domains & Routes**. Open the production address shown there. |

Hosting is in your Cloudflare account. You manage the installation and any associated charges; review the current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) for your plan.

## License

MIT. See [LICENSE](LICENSE).
