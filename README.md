# JMI Planner — Setup Guide

A personal day planner that syncs your Granola meeting notes into Supabase, extracts action items, lets you tick them off, chat with an AI assistant, and get daily Slack summaries.

## Features
- **Daily Granola sync** at 7am — pulls meetings, extracts all actions automatically
- **Persistent Supabase storage** — all historic meetings and actions kept forever
- **AI chatbot** — mark actions done, set reminders, query Granola notes, search Slack
- **Slack notifications** — 9am daily summary + reminders as DMs
- **Filters** — by owner (mine / others / all), priority, show/hide done

---

## Step 1: Supabase

1. [supabase.com](https://supabase.com) → New project
2. **SQL Editor** → paste the contents of `lib/schema.sql` → Run
3. **Settings → API** → copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2: Anthropic API key

[console.anthropic.com](https://console.anthropic.com) → API Keys → Create → `ANTHROPIC_API_KEY`

---

## Step 3: Slack bot

1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch
2. **OAuth & Permissions** → Bot Token Scopes → add: `chat:write`, `im:write`, `channels:history`, `search:read`
3. **Install to Workspace** → copy Bot User OAuth Token → `SLACK_BOT_TOKEN`
4. Your Slack User ID: click your name → View Profile → three dots → Copy member ID → `SLACK_USER_ID`

---

## Step 4: Deploy to Vercel

1. Push this repo to GitHub
2. [vercel.com](https://vercel.com) → New Project → import repo
3. Add environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
GRANOLA_MCP_URL=https://mcp.granola.ai/mcp
SLACK_BOT_TOKEN=
SLACK_USER_ID=
CRON_SECRET=any-random-string-you-choose
```

4. Deploy!

---

## Step 5: First sync

In the dashboard click **Sync Granola** to do the initial 30-day data load. After that it syncs automatically at 7am daily.

---

## Cron schedule (vercel.json)

| Time (UTC) | Endpoint | Action |
|-----------|----------|--------|
| 7:00 AM | `/api/sync` | Pull new Granola meetings + extract actions |
| 9:00 AM | `/api/reminders` | Send daily Slack summary + due reminders |

---

## Chat examples

- *"What should I focus on today?"*
- *"Mark the Fabio action as done"*
- *"What did we agree with Let Tech last week?"*
- *"Remind me about British Gas end of next week"*
- *"Add an action: call Stacy about Ocean CSV mapping"*
- *"Search Slack for any messages about Dexters"*
- *"Summarise what was discussed in the e.surv meeting"*

---

## Local dev

```bash
cp .env.example .env.local
# fill in values
npm install
npm run dev
```
