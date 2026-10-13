import type { Config } from './config.ts'
import type { Store, Task } from './store.ts'

const LABEL: Record<Task['status'], string> = {
  proposed: 'waiting for "go"',
  queued: 'queued',
  running: 'running',
  done: 'done',
  failed: 'failed',
  stopped: 'stopped',
  dismissed: 'dismissed',
}

function taskSection(cfg: Config, t: Task): string {
  const project = cfg.projects.find(p => p.name === t.project)
  const repo = project?.path ?? t.project
  const lines = [`### Task ${t.num} · ${t.title} — ${LABEL[t.status]}`, '']
  lines.push(`- Project: **${t.project}**${t.branch ? ` · branch \`${t.branch}\`` : ''}`)
  if (t.commits?.length) {
    lines.push(`- ${t.commits.length} commit${t.commits.length === 1 ? '' : 's'}${t.diffStat ? ` · ${t.diffStat}` : ''}`)
    for (const c of t.commits.slice(0, 8)) lines.push(`  - \`${c.sha}\` ${c.subject}`)
  }
  if (t.check) lines.push(`- Checks: ${t.check.ok ? 'passed' : 'FAILED'}`)
  if (t.error) lines.push(`- Problem: ${t.error}`)
  if (t.status === 'proposed') {
    lines.push('', '> ' + t.prompt.split('\n').join('\n> '))
  }
  if (t.branch && t.baseRef && t.commits?.length) {
    lines.push(
      '',
      'Review and merge at your desk:',
      '```',
      `git -C "${repo}" diff ${t.baseRef.slice(0, 10)}..${t.branch}`,
      `git -C "${repo}" merge ${t.branch}`,
      '```',
    )
  }
  if (t.worktree && ['done', 'failed', 'stopped'].includes(t.status)) {
    lines.push(`Clean up when finished: \`git -C "${repo}" worktree remove "${t.worktree}"\``)
  }
  if (t.check && !t.check.ok && t.check.output) {
    lines.push('', 'Check output (last lines):', '```', t.check.output.slice(-1500), '```')
  }
  return lines.join('\n')
}

/** One page to read when you sit back down: what the agents did, what waits for you, what was said. */
export function buildBrief(cfg: Config, store: Store, now = new Date()): string {
  const since = now.getTime() - 3 * 24 * 60 * 60_000
  const recent = store.allTasks().filter(t => Date.parse(t.endedAt ?? t.startedAt ?? t.createdAt) >= since && t.status !== 'dismissed')
  const waiting = recent.filter(t => t.status === 'proposed' || t.status === 'failed' || (t.status === 'done' && t.check && !t.check.ok))
  const finished = recent.filter(t => t.status === 'done' && !(t.check && !t.check.ok))
  const active = recent.filter(t => t.status === 'running' || t.status === 'queued')
  const other = recent.filter(t => t.status === 'stopped')

  const out = [`# Gain brief`, '', `_${now.toISOString().slice(0, 16).replace('T', ' ')} UTC · last 3 days_`, '']
  const section = (title: string, tasks: Task[]) => {
    if (!tasks.length) return
    out.push(`## ${title}`, '')
    for (const t of [...tasks].reverse()) out.push(taskSection(cfg, t), '')
  }
  section('Needs your decision', waiting)
  section('Ready to review', finished)
  section('Still working', active)
  section('Stopped', other)
  if (!recent.length) out.push('No agent tasks in the last 3 days.', '')

  const minutes = store.latestMinutes(3)
  if (minutes.length) {
    out.push('## Conversations', '')
    for (const m of minutes) out.push(m.markdown.replace(/^# /m, '### '), '')
  }
  const untracked = store.sessionMessages().filter(m => m.role === 'user').length
  if (untracked && !store.hasMinutes(store.session)) {
    out.push(`_The current conversation (${untracked} messages) has no minutes yet. Say "wrap up" or press "Write minutes"._`, '')
  }
  return out.join('\n')
}
