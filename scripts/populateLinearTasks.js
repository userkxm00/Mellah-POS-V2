import { getTeamInfo, createIssue } from './linearSync.js'

async function populateRoadmap() {
  console.log('🔄 Syncing Mellah POS tasks to Linear.app...')
  const team = await getTeamInfo('MEL')

  const stateMap = {}
  for (const s of team.states.nodes) {
    stateMap[s.name] = s.id
  }

  const tasks = [
    {
      title: 'Fix fs-extra packaging error and NSIS installer icon',
      description: 'Resolved runtime missing fs-extra error in packaged app and fixed build/icon.ico path for NSIS Windows setup.',
      stateId: stateMap['Done'],
      priority: 1,
    },
    {
      title: 'Field QA Testing of Mellah POS v2 Executable (.exe)',
      description: 'Run end-to-end user acceptance and field testing on the generated MellahPOS Setup 1.0.0.exe.',
      stateId: stateMap['In Progress'],
      priority: 2,
    },
    {
      title: 'Customer Loyalty & Points Calculation Engine',
      description: 'Calculate purchase reward points per customer and allow redeeming points for store discounts.',
      stateId: stateMap['Backlog'],
      priority: 3,
    },
    {
      title: 'Digital Receipt Dispatch (SMS / WhatsApp)',
      description: 'Allow sending digital sale receipts directly to customers via SMS or WhatsApp.',
      stateId: stateMap['Backlog'],
      priority: 3,
    },
    {
      title: 'Smart Low-Stock Alerts for Clothing Variants',
      description: 'Provide proactive notifications when specific size/color variant stock falls below reorder thresholds.',
      stateId: stateMap['Backlog'],
      priority: 2,
    },
    {
      title: 'Local Database Backup & One-Click Restore',
      description: 'Provide a simple UI button in settings to export and import local SQLite .db snapshots.',
      stateId: stateMap['Backlog'],
      priority: 2,
    },
  ]

  for (const task of tasks) {
    const issue = await createIssue(task)
    console.log(`✅ Created Issue: ${issue.identifier} - ${issue.title} (${issue.url})`)
  }

  console.log('🎉 Linear.app synchronization complete!')
}

populateRoadmap().catch((err) => console.error('❌ Error populating Linear:', err))
