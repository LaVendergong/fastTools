import express from 'express'
import net from 'node:net'

const PORT = Number(process.env.DB_PORT || 3100)
const LIMIT = 500
const IDLE_MS = 10 * 60 * 1000
const MAX_CACHE = 6
const app = express()

app.use(express.json({ limit: '4mb' }))
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (req.method === 'OPTIONS') return res.end()
  next()
})

function cleanConn(input = {}) {
  const type = String(input.type || 'mysql')
  const ssh = input.ssh
  return {
    type,
    host: String(input.host || '127.0.0.1'),
    port: Number(input.port) || (type === 'postgres' ? 5432 : 3306),
    user: String(input.user || ''),
    password: String(input.password || ''),
    database: String(input.database || (type === 'postgres' ? 'postgres' : '')),
    ssh:
      ssh && ssh.enabled
        ? {
            enabled: true,
            host: String(ssh.host || ''),
            port: Number(ssh.port) || 22,
            username: String(ssh.username || ''),
            password: String(ssh.password || ''),
            privateKey: String(ssh.privateKey || ''),
            passphrase: String(ssh.passphrase || ''),
          }
        : null,
  }
}

/* ---------------- 连接缓存 ---------------- */

const cache = new Map()

function connKey(c) {
  const ssh = c.ssh?.enabled ? `ssh:${c.ssh.host}:${c.ssh.port}:${c.ssh.username}` : ''
  return [c.type, c.host, c.port, c.user, c.database, ssh].join('|')
}

async function getClient(conn) {
  const key = connKey(conn)
  const hit = cache.get(key)
  if (hit) {
    hit.lastUsed = Date.now()
    return hit
  }

  if (cache.size >= MAX_CACHE) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
    if (oldest) {
      await closeClient(oldest[1])
      cache.delete(oldest[0])
    }
  }

  const entry = { ...(await createClient(conn)), lastUsed: Date.now(), type: conn.type }
  cache.set(key, entry)
  return entry
}

async function closeClient(entry) {
  try {
    if (entry.kind === 'mysql') await entry.client.end()
    else if (entry.kind === 'postgres') await entry.client.end()
    else if (entry.kind === 'sqlite') entry.db.close()
  } catch {
    /* 忽略 */
  }
  try {
    entry.tunnel?.close()
  } catch {
    /* 忽略 */
  }
}

setInterval(async () => {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.lastUsed > IDLE_MS) {
      const session = txSessions.get(key)
      if (session) {
        await endSession(session, 'rollback')
        txSessions.delete(key)
      }
      await closeClient(entry)
      cache.delete(key)
    }
  }
}, 60000).unref()

/* ---------------- SSH 隧道 ---------------- */

async function openTunnel(sshConfig, targetHost, targetPort) {
  const { Client } = await import('ssh2')
  const client = new Client()
  const options = {
    host: sshConfig.host,
    port: Number(sshConfig.port) || 22,
    username: sshConfig.username,
    readyTimeout: 10000,
  }
  if (sshConfig.privateKey) {
    options.privateKey = sshConfig.privateKey
    if (sshConfig.passphrase) options.passphrase = sshConfig.passphrase
  } else {
    options.password = sshConfig.password || ''
  }

  await new Promise((resolve, reject) => {
    client.once('ready', resolve)
    client.once('error', (e) => reject(new Error(`SSH 连接失败：${e.message}`)))
    client.connect(options)
  })

  const server = net.createServer((socket) => {
    client.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
      if (err) {
        socket.destroy()
        return
      }
      socket.pipe(stream).pipe(socket)
      stream.on('close', () => socket.destroy())
      socket.on('error', () => stream.destroy())
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const port = server.address().port
  return {
    port,
    close: () => {
      server.close()
      client.end()
    },
  }
}

/* ---------------- 建连 ---------------- */

async function createClient(conn) {
  if (conn.type === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite')
    if (!conn.database) throw new Error('请填写 SQLite 文件路径')
    const db = new DatabaseSync(conn.database)
    return { kind: 'sqlite', db }
  }

  let tunnel = null
  let host = conn.host
  let port = conn.port
  if (conn.ssh?.enabled) {
    tunnel = await openTunnel(conn.ssh, conn.host, conn.port)
    host = '127.0.0.1'
    port = tunnel.port
  }

  if (conn.type === 'postgres') {
    const pg = await import('pg')
    try {
      const pool = new pg.Pool({
        host,
        port,
        user: conn.user,
        password: conn.password,
        database: conn.database || 'postgres',
        connectionTimeoutMillis: 6000,
        max: 3,
      })
      const probe = await pool.connect()
      probe.release()
      return { kind: 'postgres', client: pool, tunnel }
    } catch (e) {
      tunnel?.close()
      throw e
    }
  }

  const mysql = await import('mysql2/promise')
  try {
    const pool = mysql.createPool({
      host,
      port,
      user: conn.user,
      password: conn.password,
      database: conn.database || undefined,
      connectTimeout: 6000,
      dateStrings: true,
      waitForConnections: true,
      connectionLimit: 3,
    })
    await pool.query('SELECT 1')
    return { kind: 'mysql', client: pool, tunnel }
  } catch (e) {
    tunnel?.close()
    throw e
  }
}

function quoteIdent(conn, name) {
  if (conn.type === 'mysql') return `\`${String(name).replace(/`/g, '``')}\``
  return `"${String(name).replace(/"/g, '""')}"`
}

/* ---------------- SQL 执行 ---------------- */

async function runOn(kind, target, sql) {
  if (kind === 'sqlite') {
    const stmt = target.prepare(sql)
    if (stmt.columns().length) {
      const rows = stmt.all()
      return {
        columns: stmt.columns().map((c) => c.name),
        rows: rows.slice(0, LIMIT),
        rowCount: rows.length,
        truncated: rows.length > LIMIT,
        message: '',
      }
    }
    const info = stmt.run()
    return {
      columns: [],
      rows: [],
      rowCount: info.changes,
      truncated: false,
      message: `影响 ${info.changes} 行`,
    }
  }

  if (kind === 'postgres') {
    const res = await target.query(sql)
    return {
      columns: (res.fields || []).map((f) => f.name),
      rows: (res.rows || []).slice(0, LIMIT),
      rowCount: res.rowCount ?? res.rows?.length ?? 0,
      truncated: (res.rows?.length || 0) > LIMIT,
      message: res.command && !res.fields?.length ? `${res.command} 完成` : '',
    }
  }

  const [rows, fields] = await target.query(sql)
  if (Array.isArray(rows)) {
    return {
      columns: (fields || []).map((f) => f.name),
      rows: rows.slice(0, LIMIT),
      rowCount: rows.length,
      truncated: rows.length > LIMIT,
      message: '',
    }
  }
  return {
    columns: [],
    rows: [],
    rowCount: rows.affectedRows ?? 0,
    truncated: false,
    message: `影响 ${rows.affectedRows ?? 0} 行`,
  }
}

function entryRunner(entry) {
  const target = entry.kind === 'sqlite' ? entry.db : entry.client
  return (sql) => runOn(entry.kind, target, sql)
}

/* ---------------- 事务会话 ---------------- */

const txSessions = new Map()

async function beginSession(kind, target) {
  if (kind === 'sqlite') target.exec('BEGIN')
  else if (kind === 'postgres') await target.query('BEGIN')
  else await target.beginTransaction()
}

async function endSession(session, action) {
  const { kind, client } = session
  try {
    if (kind === 'sqlite') {
      client.exec(action === 'commit' ? 'COMMIT' : 'ROLLBACK')
    } else if (kind === 'postgres') {
      await client.query(action === 'commit' ? 'COMMIT' : 'ROLLBACK')
    } else if (action === 'commit') {
      await client.commit()
    } else {
      await client.rollback()
    }
  } finally {
    if (kind === 'mysql' && session.release) session.release()
    if (kind === 'postgres' && session.release) session.release()
  }
}

async function getTxSession(conn, groupSize) {
  const key = connKey(conn)
  const existing = txSessions.get(key)
  if (existing) {
    existing.groupSize = groupSize
    existing.lastUsed = Date.now()
    return existing
  }

  const entry = await getClient(conn)
  let client
  let release = null

  if (entry.kind === 'mysql') {
    client = await entry.client.getConnection()
    release = () => client.release()
  } else if (entry.kind === 'postgres') {
    client = await entry.client.connect()
    release = () => client.release()
  } else {
    client = entry.db
  }

  const session = {
    kind: entry.kind,
    client,
    release,
    conn,
    count: 0,
    groupSize,
    lastUsed: Date.now(),
    committedGroups: 0,
  }

  await beginSession(session.kind, client)
  txSessions.set(key, session)
  return session
}

function sessionRunner(session) {
  return async (sql, count = true) => {
    const result = await runOn(session.kind, session.client, sql)
    session.lastUsed = Date.now()
    if (!count) return result

    session.count += 1
    if (session.count >= session.groupSize) {
      await endSession(session, 'commit')
      session.committedGroups += 1
      await beginSession(session.kind, session.client)
      session.count = 0
      return {
        ...result,
        message: `${result.message ? `${result.message} · ` : ''}已自动提交 1 组（${session.groupSize} 条）`,
        txCommitted: true,
      }
    }
    return result
  }
}

async function resolveRunner(conn, txOpt) {
  if (txOpt && txOpt.enabled) {
    const groupSize = Math.min(200, Math.max(1, Number(txOpt.groupSize) || 10))
    const session = await getTxSession(conn, groupSize)
    return {
      run: sessionRunner(session),
      tx: {
        active: true,
        count: session.count,
        groupSize: session.groupSize,
        committedGroups: session.committedGroups,
      },
    }
  }

  // 关闭事务模式时，若存在未提交会话则先提交，避免数据悬空
  const key = connKey(conn)
  const pending = txSessions.get(key)
  if (pending) {
    await endSession(pending, 'commit')
    txSessions.delete(key)
  }

  const entry = await getClient(conn)
  return { run: entryRunner(entry), tx: null }
}

/* ---------------- 元数据 ---------------- */

const meta = {
  async listDatabases(run, conn) {
    if (conn.type === 'sqlite') return ['main']
    if (conn.type === 'postgres') {
      const r = await run('SELECT datname AS name FROM pg_database WHERE datistemplate = false ORDER BY 1', false)
      return r.rows.map((x) => x.name)
    }
    const r = await run('SHOW DATABASES', false)
    return r.rows
      .map((x) => Object.values(x)[0])
      .filter((n) => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(n))
  },

  async tables(run, conn, database) {
    if (conn.type === 'sqlite') {
      const r = await run(
        `SELECT 'main' AS schema, name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name`,
        false,
      )
      return r.rows.map((x) => ({ schema: x.schema, name: x.name, type: x.type === 'view' ? 'VIEW' : 'TABLE' }))
    }
    const db = database || conn.database
    if (conn.type === 'postgres') {
      const r = await run(
        `SELECT table_schema AS "schema", table_name AS name, table_type AS type FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_type, table_schema, table_name`,
        false,
      )
      return r.rows.map((x) => ({ schema: x.schema, name: x.name, type: x.type }))
    }
    const where = db ? `WHERE table_schema = '${db.replace(/'/g, "''")}'` : ''
    const r = await run(
      `SELECT table_schema AS \`schema\`, table_name AS \`name\`, table_type AS \`type\`
       FROM information_schema.tables ${where} ORDER BY table_type, table_schema, table_name`,
      false,
    )
    return r.rows.map((x) => ({ schema: x.schema, name: x.name, type: x.type }))
  },

  async columns(run, conn, schema, table) {
    if (conn.type === 'sqlite') {
      const info = await run(`PRAGMA table_info(${quoteIdent(conn, table)})`, false)
      return info.rows.map((c) => ({
        name: c.name,
        type: c.type || '',
        nullable: !c.notnull,
        defaultValue: c.dflt_value,
        primary: !!c.pk,
      }))
    }

    if (conn.type === 'postgres') {
      const r = await run(
        `SELECT c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable, c.column_default AS dflt,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
         FROM information_schema.columns c
         LEFT JOIN (
           SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
           WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = '${schema.replace(/'/g, "''")}' AND tc.table_name = '${table.replace(/'/g, "''")}'
         ) pk ON pk.column_name = c.column_name
         WHERE c.table_schema = '${schema.replace(/'/g, "''")}' AND c.table_name = '${table.replace(/'/g, "''")}'
         ORDER BY c.ordinal_position`,
        false,
      )
      return r.rows.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable === 'YES',
        defaultValue: c.dflt,
        primary: c.is_pk,
      }))
    }

    const r = await run(
      `SELECT column_name AS \`name\`, column_type AS \`type\`, is_nullable AS \`nullable\`,
              column_default AS \`dflt\`, column_key AS \`key_type\`
       FROM information_schema.columns WHERE table_schema = '${schema.replace(/'/g, "''")}' AND table_name = '${table.replace(/'/g, "''")}'
       ORDER BY ordinal_position`,
      false,
    )
    return r.rows.map((c) => ({
      name: c.name,
      type: c.type,
      nullable: c.nullable === 'YES',
      defaultValue: c.dflt,
      primary: c.key_type === 'PRI',
    }))
  },

  async indexes(run, conn, schema, table) {
    if (conn.type === 'sqlite') {
      const list = await run(`PRAGMA index_list(${quoteIdent(conn, table)})`, false)
      const out = []
      for (const idx of list.rows) {
        const info = await run(`PRAGMA index_info(${quoteIdent(conn, idx.name)})`, false)
        out.push({ name: idx.name, unique: !!idx.unique, columns: info.rows.map((c) => c.name) })
      }
      return out
    }

    if (conn.type === 'postgres') {
      const r = await run(
        `SELECT indexname AS name, indexdef AS definition FROM pg_indexes WHERE schemaname = '${schema.replace(/'/g, "''")}' AND tablename = '${table.replace(/'/g, "''")}'`,
        false,
      )
      return r.rows.map((x) => ({
        name: x.name,
        unique: /UNIQUE/i.test(x.definition),
        columns: (x.definition.match(/\(([^)]+)\)/) || [])[1] || '',
      }))
    }

    const r = await run(
      `SELECT index_name AS \`name\`, non_unique, column_name AS \`col\` FROM information_schema.statistics
       WHERE table_schema = '${schema.replace(/'/g, "''")}' AND table_name = '${table.replace(/'/g, "''")}'
       ORDER BY index_name, seq_in_index`,
      false,
    )
    const grouped = new Map()
    for (const row of r.rows) {
      if (!grouped.has(row.name)) grouped.set(row.name, { name: row.name, unique: !row.non_unique, columns: [] })
      grouped.get(row.name).columns.push(row.col)
    }
    return [...grouped.values()]
  },

  async ddl(run, conn, schema, table) {
    if (conn.type === 'sqlite') {
      const r = await run(`SELECT sql FROM sqlite_master WHERE name = '${table.replace(/'/g, "''")}'`, false)
      return r.rows[0]?.sql || ''
    }

    if (conn.type === 'postgres') {
      const cols = await meta.columns(run, conn, schema, table)
      const lines = cols.map(
        (c) => `  ${quoteIdent(conn, c.name)} ${c.type}${c.nullable ? '' : ' NOT NULL'}${c.primary ? ' PRIMARY KEY' : ''}`,
      )
      return `-- 根据列信息生成\nCREATE TABLE ${quoteIdent(conn, schema)}.${quoteIdent(conn, table)} (\n${lines.join(',\n')}\n);`
    }

    const r = await run(`SHOW CREATE TABLE ${quoteIdent(conn, schema)}.${quoteIdent(conn, table)}`, false)
    return r.rows[0]?.['Create Table'] || ''
  },

  async relations(run, conn) {
    if (conn.type === 'sqlite') {
      const tables = await run(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        false,
      )
      const out = []
      for (const t of tables.rows) {
        const fks = await run(`PRAGMA foreign_key_list(${quoteIdent(conn, t.name)})`, false)
        for (const fk of fks.rows) {
          out.push({ schema: 'main', tbl: t.name, col: fk.from, ref_tbl: fk.table, ref_col: fk.to })
        }
      }
      return out
    }

    if (conn.type === 'postgres') {
      const r = await run(
        `SELECT tc.table_schema AS "schema", tc.table_name AS tbl, kcu.column_name AS col,
                ccu.table_name AS ref_tbl, ccu.column_name AS ref_col
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema NOT IN ('pg_catalog','information_schema')
         ORDER BY 1, 2, 3`,
        false,
      )
      return r.rows
    }

    const r = await run(
      `SELECT kcu.table_schema AS \`schema\`, kcu.table_name AS tbl, kcu.column_name AS col,
              kcu.referenced_table_name AS ref_tbl, kcu.referenced_column_name AS ref_col
       FROM information_schema.key_column_usage kcu
       WHERE kcu.referenced_table_name IS NOT NULL
         AND kcu.table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
       ORDER BY 1, 2, 3`,
      false,
    )
    return r.rows
  },

  async count(run, conn, schema, table, filter) {
    const name =
      conn.type === 'sqlite' ? quoteIdent(conn, table) : `${quoteIdent(conn, schema)}.${quoteIdent(conn, table)}`
    const where = filter ? ` WHERE ${filter}` : ''
    const r = await run(`SELECT COUNT(*) AS total FROM ${name}${where}`, false)
    return Number(r.rows[0]?.total ?? 0)
  },
}

/* ---------------- 路由 ---------------- */

function fail(res, e) {
  res.status(400).json({ ok: false, error: e?.message || String(e) })
}

function handler(fn) {
  return async (req, res) => {
    try {
      const conn = cleanConn(req.body)
      const { run, tx } = await resolveRunner(conn, req.body?.tx)
      const data = await fn({ req, conn, run, tx })
      res.json({ ok: true, ...data })
    } catch (e) {
      fail(res, e)
    }
  }
}

function txState(session) {
  return {
    active: true,
    count: session.count,
    groupSize: session.groupSize,
    committedGroups: session.committedGroups,
  }
}

app.post('/api/db/test', handler(async ({ run }) => {
  const r = await run('SELECT 1 AS ok', false)
  return { message: '连接成功', probe: r.rows[0] }
}))

app.post('/api/db/databases', handler(async ({ run, conn }) => ({
  databases: await meta.listDatabases(run, conn),
})))

app.post('/api/db/tables', handler(async ({ req, run, conn }) => ({
  tables: await meta.tables(run, conn, req.body?.database),
})))

app.post('/api/db/columns', handler(async ({ req, run, conn }) => {
  const { schema = '', table = '' } = req.body || {}
  if (!table) throw new Error('缺少表名')
  return { columns: await meta.columns(run, conn, schema, table) }
}))

app.post('/api/db/indexes', handler(async ({ req, run, conn }) => {
  const { schema = '', table = '' } = req.body || {}
  return { indexes: await meta.indexes(run, conn, schema, table) }
}))

app.post('/api/db/ddl', handler(async ({ req, run, conn }) => {
  const { schema = '', table = '' } = req.body || {}
  return { ddl: await meta.ddl(run, conn, schema, table) }
}))

app.post('/api/db/relations', handler(async ({ run, conn }) => ({
  relations: await meta.relations(run, conn),
})))

app.post('/api/db/count', handler(async ({ req, run, conn }) => {
  const { schema = '', table = '', filter = '' } = req.body || {}
  return { total: await meta.count(run, conn, schema, table, filter) }
}))

app.post('/api/db/query', handler(async ({ req, run, conn }) => {
  const sql = String(req.body?.sql || '').trim()
  if (!sql) throw new Error('请输入 SQL')
  // 只有写语句计入事务组，SELECT 等只读语句不占用额度
  const isWrite = /^\s*(insert|update|delete|replace|alter|create|drop|truncate|merge|grant|revoke)\b/i.test(sql)
  const started = Date.now()
  const result = await run(sql, isWrite)
  const session = txSessions.get(connKey(conn))
  return {
    ...result,
    duration: Date.now() - started,
    tx: session ? txState(session) : null,
  }
}))

app.post('/api/db/tx/rollback', handler(async ({ req, conn }) => {
  const key = connKey(conn)
  const session = txSessions.get(key)
  if (!session) throw new Error('当前没有进行中的事务')
  await endSession(session, 'rollback')
  session.committedGroups = 0
  session.count = 0
  await beginSession(session.kind, session.client)
  return { message: '已回滚当前组', tx: txState(session) }
}))

app.post('/api/db/tx/commit', handler(async ({ req, conn }) => {
  const key = connKey(conn)
  const session = txSessions.get(key)
  if (!session) throw new Error('当前没有进行中的事务')
  await endSession(session, 'commit')
  session.committedGroups += 1
  session.count = 0
  await beginSession(session.kind, session.client)
  return { message: '已提交当前组', tx: txState(session) }
}))

app.post('/api/db/tx/status', handler(async ({ req, conn }) => {
  const key = connKey(conn)
  const session = txSessions.get(key)
  return { tx: session ? txState(session) : null }
}))

app.post('/api/db/tx/close', handler(async ({ conn }) => {
  const key = connKey(conn)
  const session = txSessions.get(key)
  if (session) {
    await endSession(session, 'commit')
    txSessions.delete(key)
  }
  return { message: '已提交并关闭事务模式', tx: null }
}))

app.listen(PORT, '127.0.0.1', () => {
  console.log(`数据库网关已启动：http://127.0.0.1:${PORT}`)
})
