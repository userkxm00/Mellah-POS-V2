/**
 * Linear.app Sync Helper for Mellah POS
 * Connects directly to Linear API to sync issues, statuses, and roadmap items.
 */

import fs from 'node:fs'
import path from 'node:path'

// Read .env manually to get LINEAR_API_KEY
function getApiKey() {
  const envPath = path.join(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8')
    const match = content.match(/LINEAR_API_KEY=(.+)/)
    if (match) return match[1].trim()
  }
  return process.env.LINEAR_API_KEY
}

const API_KEY = getApiKey()
const API_URL = 'https://api.linear.app/graphql'

export async function linearQuery(query, variables = {}) {
  if (!API_KEY) {
    throw new Error('LINEAR_API_KEY is missing in .env')
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  })

  const json = await res.json()
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors, null, 2))
  }
  return json.data
}

// Helper to get team and states
export async function getTeamInfo(teamKey = 'MEL') {
  const query = `
    query GetTeam {
      teams {
        nodes {
          id
          name
          key
          states {
            nodes {
              id
              name
              type
            }
          }
        }
      }
    }
  `
  const data = await linearQuery(query)
  const team = data.teams.nodes.find((t) => t.key === teamKey) || data.teams.nodes[0]
  return team
}

// Create a Linear Issue
export async function createIssue({ title, description, stateId, priority = 0 }) {
  const team = await getTeamInfo('MEL')
  const query = `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `
  const variables = {
    input: {
      teamId: team.id,
      title,
      description,
      stateId,
      priority,
    },
  }

  const data = await linearQuery(query, variables)
  return data.issueCreate.issue
}

// CLI Execution if run directly
if (process.argv[1].endsWith('linearSync.js')) {
  getTeamInfo('MEL')
    .then((team) => {
      const safeName = (team.name || '').replace(/[\r\n]/g, '')
      console.log('✅ Connected to Linear Team:', safeName, `(${team.key})`)
      console.log('Available States:', team.states.nodes.map((s) => `${s.name} (${s.type})`).join(', '))
    })
    .catch((err) => console.error('❌ Linear Sync Error:', err.message))
}
