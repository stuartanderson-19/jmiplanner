export async function sendSlackDM(userId: string, text: string, blocks?: any[]) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN not set')

  // Open DM channel
  const openResp = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: userId }),
  })
  const openData = await openResp.json()
  if (!openData.ok) throw new Error(`Slack open DM failed: ${openData.error}`)

  const channelId = openData.channel.id

  // Send message
  const msgResp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelId, text, blocks }),
  })
  const msgData = await msgResp.json()
  if (!msgData.ok) throw new Error(`Slack send failed: ${msgData.error}`)

  return msgData
}

export function buildReminderBlocks(reminders: Array<{ text: string; meeting: string; due_at: string }>) {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '⏰ Your reminders for today', emoji: true }
    },
    ...reminders.map(r => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${r.text}*\n_From: ${r.meeting}_`
      }
    })),
    { type: 'divider' },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Manage your actions at your JMI Planner dashboard' }]
    }
  ]
}

export function buildDailySummaryBlocks(stats: {
  total: number; done: number; high: number; newMeetings: number
}) {
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📋 Good morning, Stuart — your day ahead', emoji: true }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Open actions*\n${stats.total - stats.done}` },
        { type: 'mrkdwn', text: `*High priority*\n${stats.high}` },
        { type: 'mrkdwn', text: `*Completed*\n${stats.done} (${pct}%)` },
        { type: 'mrkdwn', text: `*New meetings synced*\n${stats.newMeetings}` },
      ]
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `Progress: \`${bar}\` ${pct}%` }
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Open your JMI Planner to manage today\'s actions' }]
    }
  ]
}
