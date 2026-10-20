# Google Indexing API setup (Google for Jobs in minutes)

When a job goes live, changes, or comes down, DSO Hire can tell Google directly
instead of waiting for Google to recrawl the sitemap. New jobs then show up in
Google for Jobs within minutes, and closed jobs drop out quickly.

The code is already shipped. It stays switched off until you finish the steps
below. Plan on about 15 minutes.

## What you need

- The Google account that owns dsohire.com in Google Search Console.
- Access to the dsohire-web project in Vercel.

## Steps

1. **Create a Google Cloud project.**
   Go to https://console.cloud.google.com, sign in with the Google account
   above, click the project picker at the top, then **New project**. Name it
   something like `dsohire-indexing` and click **Create**. Make sure the new
   project is selected in the picker before you continue.

2. **Turn on the Indexing API.**
   In the search bar at the top, type **Web Search Indexing API**, open it,
   and click **Enable**.

3. **Create a service account (a robot user).**
   Open the menu (top left), go to **IAM & Admin > Service Accounts**, and
   click **Create service account**. Name it `dsohire-indexing`, click
   **Create and continue**, skip the optional role and access screens, and
   click **Done**.

4. **Copy the service account email.**
   In the list you will see an email like
   `dsohire-indexing@dsohire-indexing.iam.gserviceaccount.com`. Copy it. You
   need it in step 6.

5. **Create a JSON key.**
   Click the service account, open the **Keys** tab, click **Add key > Create
   new key**, choose **JSON**, and click **Create**. A small `.json` file
   downloads. Treat it like a password: do not email it, commit it, or paste
   it in Slack.

6. **Make the robot an Owner in Search Console.**
   Go to https://search.google.com/search-console, pick the **dsohire.com**
   property, then **Settings > Users and permissions > Add user**. Paste the
   service account email from step 4 and set the permission to **Owner**.
   (Full or Restricted is not enough; Google rejects the calls unless it is
   an Owner.)

7. **Put the key in Vercel (Production only).**
   Open the downloaded `.json` file in TextEdit and copy everything in it.
   In Vercel, open **dsohire-web > Settings > Environment Variables > Add**:
   - Name: `GOOGLE_INDEXING_SA_JSON`
   - Value: paste the whole file contents
   - Environments: tick **Production** only (untick Preview and Development)
   - Mark it **Sensitive**

   Click **Save**. Do NOT add this to the demo project (dsohire-demo).

8. **Redeploy production.**
   In Vercel, open **Deployments**, find the latest Production deployment,
   click the three dots, and choose **Redeploy**. The new variable only takes
   effect after a redeploy. Wait for it to show **Ready**.

9. **Delete the downloaded key file** from your Downloads folder (and empty
   the Trash). Vercel has the only copy you need. If it is ever lost or
   leaked, delete the key in Google Cloud (step 5 screen) and create a new one.

## How to check it works

1. Publish a public job, or edit and save a live public job.
2. In Vercel, open **dsohire-web > Logs** and search for `google-indexing`.
3. You should see a line like:

   `[google-indexing] ok URL_UPDATED https://dsohire.com/jobs/<job id>`

   When a job is paused, filled, archived, expired, deleted, made internal
   only, or made a confidential search, you will see `URL_DELETED` instead.

If you see `[google-indexing] ... failed ... HTTP 403`, the service account is
not an Owner in Search Console yet (step 6). `HTTP 429` means the daily quota
ran out; it resets the next day.

There is also a daily safety-net job (`/api/cron/google-jobs-sync`, 10:30 UTC)
that catches expirations and new postings the real-time path missed. Its log
line starts with `[cron/google-jobs-sync]`.

## Good to know

- **Quota: 200 notifications per day** by default. Each job publish, live
  edit, or takedown uses one. Several saves to the same job within 10 minutes
  only count once. If DSO Hire ever needs more, Google has a quota increase
  request form in the Google Cloud console (Indexing API > Quotas).
- Internal-only jobs, confidential searches, demo companies, and anything on
  the demo site are never sent to Google.
- It only runs on the real production site after launch. Previews, local
  development, and the demo site never send anything.
- The same events also ping IndexNow (Bing and others), which was already set
  up and needs nothing from you.
