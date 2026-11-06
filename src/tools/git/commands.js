/**
 * Git 常见操作的命令构造（数据驱动，纯函数）
 * 每个场景声明需要哪些参数，build 负责拼出命令与说明
 */

export const GROUPS = [
  { id: 'undo', name: '撤销回退' },
  { id: 'branch', name: '分支合并' },
  { id: 'inspect', name: '查看排查' },
  { id: 'sync', name: '同步协作' },
]

const pick = (values, key, fallback) => {
  const text = String(values?.[key] ?? '').trim()
  return text || fallback
}

export const SCENARIOS = [
  {
    id: 'undo-commit',
    group: 'undo',
    name: '撤销上次提交，保留改动',
    desc: '提交信息写错、漏了文件时，把最后一次提交拆回工作区，改动一点不丢。',
    fields: [],
    build: () => [
      { cmd: 'git reset --soft HEAD~1', note: 'HEAD 回退一格，改动留在暂存区' },
      { cmd: 'git status', note: '确认文件仍是已暂存状态' },
    ],
  },
  {
    id: 'amend-msg',
    group: 'undo',
    name: '修改最后一次提交信息',
    desc: '只改说明文字，不动代码内容。',
    fields: [{ key: 'message', label: '新的提交信息', placeholder: 'fix: 修正登录跳转' }],
    build: (v) => [
      { cmd: `git commit --amend -m "${pick(v, 'message', '提交信息')}"`, note: '会生成新的 commit hash' },
      { cmd: 'git push --force-with-lease', note: '已推送过的分支需要强推（比 --force 安全）' },
    ],
    warn: '如果别人已经基于这条提交开发，强推会影响他们的分支。',
  },
  {
    id: 'unstage',
    group: 'undo',
    name: '把文件撤出暂存区',
    desc: '误 add 了不想提交的文件时用，工作区内容不变。',
    fields: [{ key: 'file', label: '文件或目录', placeholder: '.', default: '.' }],
    build: (v) => [
      { cmd: `git restore --staged ${pick(v, 'file', '.')}`, note: '从暂存区移出，文件本身不变' },
    ],
  },
  {
    id: 'discard',
    group: 'undo',
    name: '丢弃工作区改动',
    desc: '把文件还原成上次提交的样子，改动会永久消失。',
    fields: [{ key: 'file', label: '文件或目录', placeholder: 'src/app.vue' }],
    build: (v) => [
      { cmd: `git restore ${pick(v, 'file', '<文件>')}`, note: '未提交的改动会被覆盖' },
    ],
    warn: '不可撤销。执行前先 git stash 或确认没有需要的改动。',
  },
  {
    id: 'revert',
    group: 'undo',
    name: '撤销已推送的提交',
    desc: '用一个反向提交抵消目标提交，不改历史，适合共享分支。',
    fields: [{ key: 'sha', label: '提交 hash', placeholder: 'a1b2c3d' }],
    build: (v) => [
      { cmd: `git revert ${pick(v, 'sha', '<hash>')}`, note: '生成一条反向提交' },
      { cmd: 'git push', note: '正常推送即可，无需强推' },
    ],
  },
  {
    id: 'merge',
    group: 'branch',
    name: '合并分支',
    desc: '把功能分支合进主干，保留合并节点。',
    fields: [
      { key: 'target', label: '目标分支', placeholder: 'main', default: 'main' },
      { key: 'source', label: '来源分支', placeholder: 'feature/login' },
    ],
    build: (v) => [
      { cmd: `git switch ${pick(v, 'target', 'main')}`, note: '先切到目标分支' },
      { cmd: 'git pull --ff-only', note: '确保目标分支是最新的' },
      { cmd: `git merge --no-ff ${pick(v, 'source', '<分支>')}`, note: '强制保留合并节点，历史更清晰' },
    ],
  },
  {
    id: 'rebase',
    group: 'branch',
    name: '变基到最新主干',
    desc: '把自己分支的提交挪到主干最新提交之后，历史是一条直线。',
    fields: [{ key: 'base', label: '基线分支', placeholder: 'origin/main', default: 'origin/main' }],
    build: (v) => [
      { cmd: 'git fetch origin', note: '先拿到远端最新' },
      { cmd: `git rebase ${pick(v, 'base', 'origin/main')}`, note: '冲突时改完文件再 git rebase --continue' },
      { cmd: 'git push --force-with-lease', note: '变基后必须强推（仅限自己的分支）' },
    ],
    warn: '不要对已共享的分支变基，会改写别人的历史。',
  },
  {
    id: 'cherry-pick',
    group: 'branch',
    name: '挑拣某个提交',
    desc: '把另一个分支上的单个提交摘到当前分支。',
    fields: [{ key: 'sha', label: '提交 hash', placeholder: 'a1b2c3d' }],
    build: (v) => [
      { cmd: `git cherry-pick ${pick(v, 'sha', '<hash>')}`, note: '只摘这一条提交，不带它之后的' },
      { cmd: 'git cherry-pick --abort', note: '冲突太多时放弃，回到操作前' },
    ],
  },
  {
    id: 'recover-branch',
    group: 'inspect',
    name: '找回误删的分支',
    desc: '分支删掉后提交还在，从 reflog 里捞回来。',
    fields: [{ key: 'branch', label: '分支名', placeholder: 'feature/login' }],
    build: (v) => [
      { cmd: 'git reflog', note: '找到删除前那条提交的 hash' },
      {
        cmd: `git switch -c ${pick(v, 'branch', '<分支名>')} <reflog 里的 hash>`,
        note: '用旧 hash 新建分支',
      },
    ],
  },
  {
    id: 'clean',
    group: 'inspect',
    name: '清理未跟踪文件',
    desc: '构建产物、临时文件太多时清理，先用 -n 预览。',
    fields: [{ key: 'path', label: '限定目录（可选）', placeholder: 'dist' }],
    build: (v) => [
      { cmd: `git clean -nd ${pick(v, 'path', '')}`.trim(), note: '-n 只预览，列出将被删除的文件' },
      { cmd: `git clean -fd ${pick(v, 'path', '')}`.trim(), note: '确认无误后再真正删除' },
    ],
    warn: '被删除的未跟踪文件无法通过 git 恢复。',
  },
  {
    id: 'stash',
    group: 'sync',
    name: '暂存当前改动',
    desc: '临时切分支修 bug 时，先把半成品存起来。',
    fields: [{ key: 'message', label: '备注', placeholder: '登录页改到一半' }],
    build: (v) => [
      { cmd: `git stash push -m "${pick(v, 'message', '临时改动')}"`, note: '连同未跟踪文件用 -u' },
      { cmd: 'git stash list', note: '查看存了哪些' },
      { cmd: 'git stash pop', note: '恢复最近一次并删除该记录' },
    ],
  },
  {
    id: 'log-file',
    group: 'inspect',
    name: '查看某个文件的修改历史',
    desc: '追查一行代码是谁改的、为什么改。',
    fields: [{ key: 'file', label: '文件路径', placeholder: 'src/main.js' }],
    build: (v) => [
      { cmd: `git log --oneline --follow -- ${pick(v, 'file', '<文件>')}`, note: '跟随重命名' },
      { cmd: `git log -p -2 -- ${pick(v, 'file', '<文件>')}`, note: '看最近两次的具体改动' },
    ],
  },
  {
    id: 'sync-fork',
    group: 'sync',
    name: '同步 fork 的上游',
    desc: 'Fork 的项目落后于原仓库时，把上游更新拉下来。',
    fields: [{ key: 'url', label: '上游仓库地址', placeholder: 'https://github.com/org/repo.git' }],
    build: (v) => [
      { cmd: `git remote add upstream ${pick(v, 'url', '<上游地址>')}`, note: '只需执行一次' },
      { cmd: 'git fetch upstream', note: '拉取上游更新' },
      { cmd: 'git rebase upstream/main', note: '把自己的提交接到上游最新之后' },
      { cmd: 'git push --force-with-lease', note: '同步后强推自己的 fork' },
    ],
  },
]

export function findScenario(id) {
  return SCENARIOS.find((s) => s.id === id) || SCENARIOS[0]
}

/** 场景缺必填参数时给出提示（目前只有带 fields 的场景需要） */
export function missingFields(scenario, values) {
  return (scenario?.fields || [])
    .filter((f) => !f.default && !String(values?.[f.key] ?? '').trim())
    .map((f) => f.label)
}

/** 生成整段可复制脚本 */
export function toScript(commands) {
  return (commands || []).map((c) => c.cmd).join('\n')
}
