/**
 * 安全表达式引擎：不依赖 eval / new Function。
 * 支持：数字/字符串/布尔/null、标识符与成员访问、算术、比较、逻辑、三元、
 *      函数调用（min/max/clamp/abs/round/floor/ceil/sqrt/pow/log/sign/has/len）。
 * 用于：派生属性公式、分支条件、蓝图评分、战斗参数。
 */

const FUNCS = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  abs: (v) => Math.abs(v),
  round: (v, d = 0) => {
    const p = Math.pow(10, d)
    return Math.round(v * p) / p
  },
  floor: (v) => Math.floor(v),
  ceil: (v) => Math.ceil(v),
  sqrt: (v) => Math.sqrt(v),
  pow: (a, b) => Math.pow(a, b),
  log: (v) => Math.log(v),
  sign: (v) => Math.sign(v),
  if: (c, a, b) => (c ? a : b),
  has: (obj, key) => !!(obj && (Array.isArray(obj) ? obj.includes(key) : obj[key])),
  len: (v) => (v == null ? 0 : Array.isArray(v) || typeof v === 'string' ? v.length : Object.keys(v).length)
}

const TOKEN = /^\s*(?:(?<num>\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(?<str>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(?<id>[A-Za-z_$][\w$]*)|(?<op>===|!==|==|!=|<=|>=|&&|\|\||[-+*/%^!<>?:(),.[\]{}]))/

function tokenize(src) {
  const tokens = []
  let rest = src
  while (rest.length) {
    if (/^\s*$/.test(rest)) break
    const m = TOKEN.exec(rest)
    if (!m) throw new SyntaxError(`表达式无法解析：${rest.slice(0, 24)}`)
    const g = m.groups
    if (g.num != null) tokens.push({ t: 'num', v: Number(g.num) })
    else if (g.str != null) tokens.push({ t: 'str', v: JSON.parse(g.str.replace(/^'|'$/g, '"')) })
    else if (g.id != null) tokens.push({ t: 'id', v: g.id })
    else tokens.push({ t: 'op', v: g.op })
    rest = rest.slice(m[0].length)
  }
  tokens.push({ t: 'eof' })
  return tokens
}

const KEYWORDS = {
  and: { t: 'op', v: '&&' },
  or: { t: 'op', v: '||' },
  not: { t: 'op', v: '!' }
}
const LITERALS = { true: true, false: false, null: null }

class Parser {
  constructor(tokens) {
    this.i = 0
    this.tokens = tokens
  }
  peek() {
    const tk = this.tokens[this.i]
    if (tk.t === 'id' && KEYWORDS[tk.v]) return KEYWORDS[tk.v]
    return tk
  }
  next() {
    return this.tokens[this.i++]
  }
  isOp(v) {
    const tk = this.peek()
    return tk.t === 'op' && tk.v === v
  }
  eat(v) {
    if (!this.isOp(v)) throw new SyntaxError(`期望 "${v}"，实际 "${this.peek().v ?? 'EOF'}"`)
    return this.next()
  }
  parse() {
    const node = this.ternary()
    if (this.peek().t !== 'eof') throw new SyntaxError(`多余的符号 "${this.peek().v}"`)
    return node
  }
  ternary() {
    const cond = this.binary(0)
    if (this.isOp('?')) {
      this.next()
      const a = this.ternary()
      this.eat(':')
      const b = this.ternary()
      return { k: 'cond', cond, a, b }
    }
    return cond
  }
  binary(level) {
    const levels = [
      ['||'],
      ['&&'],
      ['==', '!=', '===', '!=='],
      ['<', '<=', '>', '>='],
      ['+', '-'],
      ['*', '/', '%'],
      ['^']
    ]
    if (level >= levels.length) return this.unary()
    let left = this.binary(level + 1)
    for (;;) {
      const tk = this.peek()
      if (tk.t === 'op' && levels[level].includes(tk.v)) {
        this.next()
        // ^ 为右结合，其余左结合
        const right = tk.v === '^' ? this.binary(level) : this.binary(level + 1)
        left = { k: 'bin', op: tk.v, l: left, r: right }
      } else return left
    }
  }
  unary() {
    const tk = this.peek()
    if (tk.t === 'op' && (tk.v === '!' || tk.v === '-' || tk.v === '+')) {
      this.next()
      return { k: 'un', op: tk.v, v: this.unary() }
    }
    return this.postfix()
  }
  postfix() {
    let node = this.primary()
    for (;;) {
      if (this.isOp('.')) {
        this.next()
        const name = this.next()
        if (name.t !== 'id' && name.t !== 'num') throw new SyntaxError('成员名非法')
        node = { k: 'mem', obj: node, name: String(name.v) }
      } else if (this.isOp('[')) {
        this.next()
        const key = this.ternary()
        this.eat(']')
        node = { k: 'idx', obj: node, key }
      } else if (this.isOp('(')) {
        this.next()
        const args = []
        if (!this.isOp(')')) {
          for (;;) {
            args.push(this.ternary())
            if (this.isOp(',')) { this.next(); continue }
            break
          }
        }
        this.eat(')')
        node = { k: 'call', callee: node, args }
      } else return node
    }
  }
  primary() {
    const tk = this.next()
    if (tk.t === 'num' || tk.t === 'str') return { k: 'lit', v: tk.v }
    if (tk.t === 'id' && Object.prototype.hasOwnProperty.call(LITERALS, tk.v)) return { k: 'lit', v: LITERALS[tk.v] }
    if (tk.t === 'op' && tk.v === '(') {
      const node = this.ternary()
      this.eat(')')
      return node
    }
    if (tk.t === 'op' && tk.v === '[') {
      const items = []
      if (!this.isOp(']')) {
        for (;;) {
          items.push(this.ternary())
          if (this.isOp(',')) { this.next(); continue }
          break
        }
      }
      this.eat(']')
      return { k: 'arr', items }
    }
    if (tk.t === 'id') return { k: 'var', name: tk.v }
    throw new SyntaxError(`无法识别的记号 "${tk.v ?? 'EOF'}"`)
  }
}

const cache = new Map()
function compile(src) {
  if (typeof src !== 'string' || !src.trim()) throw new SyntaxError('表达式为空')
  const hit = cache.get(src)
  if (hit) return hit
  const ast = new Parser(tokenize(src)).parse()
  cache.set(src, ast)
  if (cache.size > 500) cache.delete(cache.keys().next().value)
  return ast
}

function truthy(v) {
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.length > 0
  return !!v
}

function evalNode(node, ctx) {
  switch (node.k) {
    case 'lit':
      return node.v
    case 'arr':
      return node.items.map((n) => evalNode(n, ctx))
    case 'var': {
      if (Object.prototype.hasOwnProperty.call(ctx, node.name)) return ctx[node.name]
      throw new ReferenceError(`未知变量 "${node.name}"`)
    }
    case 'mem': {
      const obj = evalNode(node.obj, ctx)
      if (obj == null) return undefined
      return obj[node.name]
    }
    case 'idx': {
      const obj = evalNode(node.obj, ctx)
      const key = evalNode(node.key, ctx)
      return obj == null ? undefined : obj[key]
    }
    case 'un': {
      const v = evalNode(node.v, ctx)
      if (node.op === '!') return !truthy(v)
      if (node.op === '-') return -Number(v)
      return Number(v)
    }
    case 'cond':
      return truthy(evalNode(node.cond, ctx)) ? evalNode(node.a, ctx) : evalNode(node.b, ctx)
    case 'bin': {
      const { op } = node
      if (op === '&&') return truthy(evalNode(node.l, ctx)) ? truthy(evalNode(node.r, ctx)) : false
      if (op === '||') return truthy(evalNode(node.l, ctx)) ? true : truthy(evalNode(node.r, ctx))
      const l = evalNode(node.l, ctx)
      const r = evalNode(node.r, ctx)
      switch (op) {
        case '+': return typeof l === 'string' || typeof r === 'string' ? String(l) + String(r) : Number(l) + Number(r)
        case '-': return Number(l) - Number(r)
        case '*': return Number(l) * Number(r)
        case '/': return Number(l) / Number(r)
        case '%': return Number(l) % Number(r)
        case '^': return Math.pow(Number(l), Number(r))
        case '<': return l < r
        case '<=': return l <= r
        case '>': return l > r
        case '>=': return l >= r
        case '==': return l == r // eslint-disable-line eqeqeq
        case '!=': return l != r // eslint-disable-line eqeqeq
        case '===': return l === r
        case '!==': return l !== r
        default: throw new SyntaxError(`未知运算符 ${op}`)
      }
    }
    case 'call': {
      if (node.callee.k !== 'var') throw new SyntaxError('只允许调用内置函数')
      const fn = FUNCS[node.callee.name]
      if (!fn) throw new ReferenceError(`未知函数 "${node.callee.name}"`)
      return fn(...node.args.map((a) => evalNode(a, ctx)))
    }
    default:
      throw new SyntaxError('未知节点')
  }
}

/** 求值；ctx 为变量对象。 */
export function evaluate(src, ctx = {}) {
  return evalNode(compile(src), ctx)
}

/** 表达式是否合法；返回 {ok, error?, value?} */
export function check(src, ctx = {}) {
  try {
    return { ok: true, value: evaluate(src, ctx) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/** 收集表达式引用的变量名（排除内置函数名与成员属性名）。 */
export function variablesOf(src) {
  const out = new Set()
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (n.k === 'var') out.add(n.name)
    else if (n.k === 'mem') walk(n.obj)
    else if (n.k === 'idx') { walk(n.obj); walk(n.key) }
    else if (n.k === 'call') n.args.forEach(walk)
    else if (n.k === 'un') walk(n.v)
    else if (n.k === 'cond') { walk(n.cond); walk(n.a); walk(n.b) }
    else if (n.k === 'bin') { walk(n.l); walk(n.r) }
    else if (n.k === 'arr') n.items.forEach(walk)
  }
  try {
    walk(compile(src))
  } catch {
    return []
  }
  return [...out]
}

export const BUILTIN_FUNCTIONS = Object.keys(FUNCS)
