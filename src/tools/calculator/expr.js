// 轻量表达式解析器：支持 + - * / ^ ! 括号、sin/cos/tan 等函数、π/e 常量
const FUNCTIONS = {
  sin: 1,
  cos: 1,
  tan: 1,
  asin: 1,
  acos: 1,
  atan: 1,
  ln: 1,
  log: 1,
  sqrt: 1,
  abs: 1,
  exp: 1,
}

const CONSTANTS = {
  'π': Math.PI,
  pi: Math.PI,
  e: Math.E,
}

// 分词结果缓存：绘图每帧要算上千次，避免重复 tokenize
const tokenCache = new Map()

function tokenize(input, vars) {
  const key = vars ? `${input}\u0001${Object.keys(vars).join(',')}` : input
  const cached = tokenCache.get(key)
  if (cached) return cached
  const tokens = doTokenize(input, vars)
  if (tokenCache.size > 300) tokenCache.clear()
  tokenCache.set(key, tokens)
  return tokens
}

function doTokenize(input, vars) {
  const tokens = []
  let i = 0
  const src = String(input).replace(/\s+/g, '')

  while (i < src.length) {
    const ch = src[i]

    if (/[0-9.]/.test(ch)) {
      let num = ''
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++]
      tokens.push({ type: 'num', value: Number(num) })
      continue
    }

    if (/[a-zA-Z]/.test(ch) || ch === 'π') {
      let name = ch
      i++
      while (i < src.length && /[a-zA-Z]/.test(src[i])) name += src[i++]
      if (vars && Object.prototype.hasOwnProperty.call(vars, name)) {
        tokens.push({ type: 'var', value: name })
      } else if (CONSTANTS[name] !== undefined) {
        tokens.push({ type: 'num', value: CONSTANTS[name] })
      } else if (FUNCTIONS[name]) {
        tokens.push({ type: 'func', value: name })
      } else {
        throw new Error(`无法识别的名称：${name}`)
      }
      continue
    }

    if ('+-*/^!()%'.includes(ch)) {
      tokens.push({ type: 'op', value: ch })
      i++
      continue
    }

    throw new Error(`无法识别的字符：${ch}`)
  }

  return tokens
}

export function evaluate(input, { deg = false, vars = null } = {}) {
  const tokens = tokenize(input, vars)
  let pos = 0

  const peek = () => tokens[pos]
  const eat = (value) => {
    const token = tokens[pos]
    if (!token || token.value !== value) return false
    pos++
    return true
  }

  function parseExpression() {
    let value = parseTerm()
    while (peek() && (peek().value === '+' || peek().value === '-')) {
      const op = tokens[pos++].value
      const right = parseTerm()
      value = op === '+' ? value + right : value - right
    }
    return value
  }

  function parseTerm() {
    let value = parseUnary()
    while (peek() && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = tokens[pos++].value
      const right = parseUnary()
      if (op === '*') value *= right
      else if (op === '/') {
        if (right === 0) throw new Error('不能除以零')
        value /= right
      } else {
        value = value % 100
      }
    }
    return value
  }

  function parseUnary() {
    if (peek() && peek().value === '-') {
      pos++
      return -parseUnary()
    }
    if (peek() && peek().value === '+') {
      pos++
      return parseUnary()
    }
    return parsePower()
  }

  function parsePower() {
    const base = parsePostfix()
    if (peek() && peek().value === '^') {
      pos++
      return base ** parseUnary()
    }
    return base
  }

  function parsePostfix() {
    let value = parsePrimary()
    while (peek() && peek().value === '!') {
      pos++
      value = factorial(value)
    }
    return value
  }

  function parsePrimary() {
    const token = peek()
    if (!token) throw new Error('表达式不完整')

    if (token.type === 'num') {
      pos++
      return token.value
    }

    if (token.type === 'var') {
      pos++
      return vars[token.value]
    }

    if (token.type === 'func') {
      pos++
      if (!eat('(')) throw new Error(`${token.value} 后需要括号`)
      const arg = parseExpression()
      if (!eat(')')) throw new Error('缺少右括号')
      const fn = token.value
      const value =
        fn === 'sin'
          ? Math.sin(deg ? (arg * Math.PI) / 180 : arg)
          : fn === 'cos'
            ? Math.cos(deg ? (arg * Math.PI) / 180 : arg)
            : fn === 'tan'
              ? Math.tan(deg ? (arg * Math.PI) / 180 : arg)
              : fn === 'asin'
                ? (v => (deg ? (v * 180) / Math.PI : v))(Math.asin(arg))
                : fn === 'acos'
                  ? (v => (deg ? (v * 180) / Math.PI : v))(Math.acos(arg))
                  : fn === 'atan'
                    ? (v => (deg ? (v * 180) / Math.PI : v))(Math.atan(arg))
                    : fn === 'ln'
                      ? Math.log(arg)
                      : fn === 'log'
                        ? Math.log10(arg)
                        : fn === 'sqrt'
                          ? Math.sqrt(arg)
                          : fn === 'abs'
                            ? Math.abs(arg)
                            : Math.exp(arg)
      if (!Number.isFinite(value)) throw new Error('结果无效')
      return value
    }

    if (token.value === '(') {
      pos++
      const value = parseExpression()
      if (!eat(')')) throw new Error('缺少右括号')
      return value
    }

    throw new Error(`意外的符号：${token.value}`)
  }

  const result = parseExpression()
  if (pos < tokens.length) throw new Error(`多余的内容：${tokens[pos].value}`)
  if (!Number.isFinite(result)) throw new Error('结果无效')
  return result
}

function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) throw new Error('阶乘只支持非负整数')
  if (n > 170) throw new Error('数值过大')
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}
