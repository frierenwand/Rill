# Rill

Deploy and manage your own installation on Cloudflare Workers.

Everything happens in your browser. No downloads or domain name needed.

### 1. Sign in

Have a [GitHub account](https://github.com/signup) and a [Cloudflare account](https://dash.cloudflare.com/sign-up) ready. GitHub holds your copy of the project; Cloudflare hosts it.

### 2. Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mrtxiv/Rill)

- Choose your Cloudflare account and connect GitHub when prompted. Approve access for **Cloudflare Workers & Pages**.
- Choose where to create your GitHub repository and give it a name. Cloudflare makes the copy for you.
- Keep the suggested Worker and database names, or choose unused names. Leave the detected settings as they are, then select **Deploy**.

Wait for the deployment to succeed. Cloudflare handles the build and database setup. [About this deployment flow](https://developers.cloudflare.com/workers/platform/deploy-buttons/).

<details>
<summary>If you’re asked for build settings</summary>

Use these values for this project:

| Setting | Value |
| --- | --- |
| Root directory | Repository root (`/`) |
| Build command | Leave empty |
| Deploy command | `npm run deploy` |
| D1 database binding | `DB` |
| Required variables or secrets | None for deployment and first login |

The database name can change, but the binding must stay `DB`. Tables are created automatically on first use; you do not need to import SQL or run migrations.

You can change build settings later under your Worker's **Settings → Build**. See [Cloudflare's build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

If you are deploying through a GitHub organization, its administrator may need to approve access. See [GitHub connection permissions](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/#manage-access).

</details>

### 3. Open it

- In the [Cloudflare dashboard](https://dash.cloudflare.com/), go to **Workers & Pages** and select your Worker.
- Under **Settings → Domains & Routes**, open the `workers.dev` address shown for your installation.
- Create your installation account with a password of at least **8 characters**. This is separate from your GitHub and Cloudflare accounts.

Once the settings page opens, you're done. Bookmark the address.

<details>
<summary>Address and username details</summary>

Your address looks like `https://your-worker.your-subdomain.workers.dev`. Use the actual address Cloudflare shows, rather than this example. You do not need a custom domain. See [Cloudflare's address documentation](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

Your username can contain 1–32 letters, numbers, dots, dashes or underscores.

</details>

---

### Updates

**Installing with Deploy to Cloudflare does not guarantee automatic updates from the original Rill repository.** An inspected installation created by this flow contained neither the GitHub Actions workflow nor the original Git history. Such a copy has no **Sync with upstream** action or **Sync fork** button. Copying the existing workflow into it is insufficient: that workflow requires shared Git history to merge updates.

These installations currently need a separate update setup that supports their imported repository and preserves their Worker name, D1 database binding, and database ID in `wrangler.jsonc`. An update procedure for that installation path has not yet been verified.

For a fork or clone that **retains the original Git history and includes `.github/workflows/sync.yml`**, the workflow checks for updates daily at **04:17 UTC** while GitHub Actions is enabled. To run that workflow manually:

1. Open **your own copy** of the repository on GitHub and select **Actions**. Enable workflows if GitHub prompts you to do so.
2. Select **Sync with upstream** in the sidebar.
3. Select **Run workflow**, choose the branch connected to your Cloudflare deployment (normally `main`), then confirm **Run workflow**.
4. Wait for the workflow to finish successfully. If it pulls new changes, Cloudflare should automatically build and deploy them.
5. In Cloudflare, open **Workers & Pages → your Worker → Deployments** and confirm that the new deployment succeeded.

Redeploying from Cloudflare alone uses the code already in your GitHub copy; it does not fetch updates from the original Rill repository.

If the sync fails, open its run in GitHub Actions and check the error. Changes you made to the same files as the original repository may need to be resolved manually. If the workflow reports **Already up to date**, there are no new changes to deploy. The workflow intentionally skips the original `mrtxiv/Rill` repository; it only updates downstream copies.

[About running GitHub workflows manually](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

<details>
<summary>Need help deploying?</summary>

**GitHub account or repository unavailable**

Check the Cloudflare Workers & Pages app's access in [GitHub → Settings → Applications](https://github.com/settings/installations). For an organization, ask its administrator to approve the connection.

**Build or deployment failed**

Open the failed build from your Worker's **Deployments** tab and read the error log. Check the build settings above. Cloudflare's [build troubleshooting guide](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/) covers common errors.

**“Durable storage is not configured”**

Open your Worker's **Bindings** tab and check for a D1 database connected as `DB`. If missing, select **Add binding → D1 database**, enter `DB` as the variable name, and choose the database created for this installation. See [Cloudflare's D1 binding instructions](https://developers.cloudflare.com/d1/get-started/#3-bind-your-worker-to-your-d1-database).

**The address does not open**

Confirm deployment succeeded and that the `workers.dev` route is enabled under **Settings → Domains & Routes**. Open the production address shown there.

</details>

<details>
<summary>Hosting and usage</summary>

Hosting is in your Cloudflare account. You manage the installation and any associated charges. Review the current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) for your plan.

</details>

[MIT License](LICENSE)
