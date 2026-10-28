import { STDLIB } from "./stdlib.ts";

// Sorts Python imports as ruff's isort rule (I001) fixes them with its default settings, which is
// what Zed's organize imports runs for Python through ruff. Each run of import statements in one
// body is a block; comments and blank lines inside it do not end it, any other statement does.
// The steps follow ruff's crates/ruff_linter/src/rules/isort: annotate (attach comments),
// normalize (merge statements), categorize (sections), order, format. ruff's settings it does not
// read, such as isort: directives and first-party detection, take their defaults here.
const LINE_LENGTH = 88;
const NAME = String.raw`[\p{L}_][\p{L}\p{N}_]*`;
const DOTTED = new RegExp(String.raw`^${NAME}(?:\.${NAME})*$`, "u");
const IDENT = new RegExp(`^${NAME}$`, "u");

// One statement or more, over physical lines start..end, with each line's code and comment.
interface Logical { start: number; end: number; indent: string; lines: { code: string; comment: string | null }[] }

// A string open at the scan position, or a replacement field inside an f-string or t-string,
// where code runs again and strings can nest with the same quotes (Python 3.12).
type Open = { quote: string; fields: boolean } | { braces: number };

// Splits the buffer into logical lines, following brackets, strings and backslash continuations.
// Lines outside any logical line are blank or hold only a comment.
function scan(lines: string[]) {
  const logicals: Logical[] = [];
  const comments = new Map<number, string>(); // comment-only lines
  const open: Open[] = [];
  let depth = 0;
  let current: Logical | null = null;
  lines.forEach((text, n) => {
    let code = text, comment: string | null = null;
    for (let i = 0; i < text.length; ) {
      const top = open.at(-1);
      const c = text[i];
      if (top && "quote" in top) {
        if (c === "\\") i += 2;
        else if (text.startsWith(top.quote, i)) (i += top.quote.length), open.pop();
        else if (top.fields && (c === "{" || c === "}")) {
          if (text[i + 1] === c) i += 2; // {{ and }} stand for one brace
          else {
            if (c === "{") open.push({ braces: 0 });
            i++;
          }
        } else i++;
      } else if (c === "#" && !top) {
        (code = text.slice(0, i)), (comment = text.slice(i).trimEnd());
        break;
      } else if (c === '"' || c === "'") {
        const quote = text.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
        const prefix = /(?<![\p{L}\p{N}_])[rRbBfFtTuU]{1,2}$/u.exec(text.slice(0, i))?.[0] ?? "";
        open.push({ quote, fields: /[fFtT]/.test(prefix) });
        i += quote.length;
      } else if (top) {
        // Inside a replacement field: its closing brace ends it.
        if (c === "{") top.braces++;
        else if (c === "}") {
          if (top.braces) top.braces--;
          else open.pop();
        }
        i++;
      } else {
        if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) depth = Math.max(0, depth - 1);
        i++;
      }
    }
    const continued = /\\\s*$/.test(code);
    // An unclosed one-line string ends with its line, with any field inside it.
    const oneLine = open.findIndex((o) => "quote" in o && o.quote.length === 1);
    if (oneLine >= 0 && !continued) open.length = oneLine;
    if (!current && !code.trim()) {
      if (comment) comments.set(n, comment);
      return;
    }
    current ??= { start: n, end: n, indent: text.match(/^\s*/)![0], lines: [] };
    current.lines.push({ code, comment });
    current.end = n;
    if (!open.length && !depth && !continued) logicals.push(current), (current = null);
  });
  if (current) logicals.push(current);
  return { logicals, comments };
}

interface Alias { name: string; as: string | null; line: number; atop: string[]; inline: string[]; trailing: string[] }
interface Statement {
  from: boolean;
  module: string; // for from, without the leading dots
  level: number;
  aliases: Alias[];
  atop: string[];
  inline: string[];
  trailing: string[];
  comma: boolean; // a trailing comma inside parentheses keeps the statement split, as ruff does
}

// The statements of a logical line that holds only imports, or null.
function parse(logical: Logical): Statement[] | null {
  const tokens: { text: string; line: number }[] = [];
  for (const [i, { code }] of logical.lines.entries()) {
    for (const m of code.replace(/\\\s*$/, "").matchAll(/[\p{L}\p{N}_.]+|[*,();]|\S/gu)) tokens.push({ text: m[0], line: logical.start + i });
  }
  const statements: Statement[] = [];
  let t = 0;
  const peek = () => tokens[t]?.text;
  const alias = (allowStar: boolean): Alias | null => {
    const name = tokens[t];
    if (!name || !(DOTTED.test(name.text) || (allowStar && name.text === "*"))) return null;
    t++;
    let as: string | null = null;
    if (peek() === "as") {
      t++;
      if (!IDENT.test(peek() ?? "")) return null;
      as = tokens[t++].text;
    }
    return { name: name.text, as, line: name.line, atop: [], inline: [], trailing: [] };
  };
  while (t < tokens.length) {
    const keyword = tokens[t++].text;
    const statement: Statement = { from: keyword === "from", module: "", level: 0, aliases: [], atop: [], inline: [], trailing: [], comma: false };
    if (keyword === "import") {
      do {
        const a = alias(false);
        if (!a) return null;
        statement.aliases.push(a);
      } while (peek() === "," && ++t);
    } else if (keyword === "from") {
      const module = tokens[t++]?.text ?? "";
      const m = /^(\.*)(.*)$/.exec(module)!;
      if (m[2] && !DOTTED.test(m[2])) return null;
      if (!m[1] && !m[2]) return null;
      [statement.level, statement.module] = [m[1].length, m[2]];
      if (tokens[t++]?.text !== "import") return null;
      const parens = peek() === "(" && ++t;
      do {
        if (parens && peek() === ")") break; // after a trailing comma
        const a = alias(!parens && !statement.aliases.length);
        if (!a) return null;
        statement.aliases.push(a);
        if (a.name === "*") break;
      } while (peek() === "," && ++t);
      if (parens) {
        statement.comma = tokens[t - 1]?.text === ",";
        if (tokens[t++]?.text !== ")") return null;
      }
      if (!statement.aliases.length) return null;
    } else return null;
    statements.push(statement);
    if (t < tokens.length && tokens[t++].text !== ";") return null;
  }
  return statements;
}

// Attaches the comments of a one-statement logical line as ruff's annotate_imports does.
function annotate(statement: Statement, logical: Logical) {
  const comments = logical.lines
    .map(({ comment }, i) => comment && { line: logical.start + i, text: comment })
    .filter((c) => !!c);
  const take = (test: (line: number) => boolean) => {
    const taken: string[] = [];
    while (comments.length && test(comments[0].line)) taken.push(comments.shift()!.text);
    return taken;
  };
  if (!statement.from) {
    statement.inline = take(() => true);
    return;
  }
  const [first] = statement.aliases;
  if (statement.aliases.length > 1 || first.line !== logical.start) statement.inline = take((line) => line === logical.start);
  for (const a of statement.aliases) {
    a.atop = take((line) => line < a.line);
    a.inline = take((line) => line === a.line);
  }
  statement.aliases.at(-1)!.trailing = take((line) => line < logical.end);
  statement.trailing = take(() => true);
}

// natord::compare, as ruff orders names: digit runs compare as numbers.
function natord(a: string, b: string) {
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (/\d/.test(a[i]) && /\d/.test(b[j])) {
      const x = /^\d+/.exec(a.slice(i))![0], y = /^\d+/.exec(b.slice(j))![0];
      const cmp = x[0] === "0" || y[0] === "0" ? (x < y ? -1 : x > y ? 1 : 0) : x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
      if (cmp) return cmp;
      i += x.length;
      j += y.length;
    } else {
      if (a[i] !== b[j]) return a[i] < b[j] ? -1 : 1;
      i++;
      j++;
    }
  }
  return (a.length - i) - (b.length - j);
}

type Key = (string | number | null)[];
// Compares keys field by field: null (ruff's None) first, strings in natural order.
function compare(a: Key, b: Key) {
  for (let i = 0; i < a.length; i++) {
    const [x, y] = [a[i], b[i]];
    if (x === y) continue;
    if (x === null || y === null) return x === null ? -1 : 1;
    const cmp = typeof x === "number" ? x - (y as number) : natord(x, y as string);
    if (cmp) return cmp;
  }
  return 0;
}

// MemberKey: star first, then constants, classes and variables, each case-insensitively.
function memberKey(name: string, as: string | null): Key {
  const cased = /\p{Lu}|\p{Ll}/u.test(name) && name === name.toUpperCase();
  const type = name.length > 1 && cased ? 0 : /^\p{Lu}/u.test(name) ? 1 : 2;
  return [name === "*" ? 0 : 1, type, name.toLowerCase(), name, as];
}

// ModuleKey: relative imports furthest first, then the name case-insensitively.
const moduleKey = (module: string | null, as: string | null, level: number, first: Key | null): Key => [
  level ? 1 : 2,
  -level,
  module && module.toLowerCase(),
  module,
  ...(first ?? [null, null, null, null, null]),
  as,
];

const SECTIONS = ["future", "stdlib", "third", "local"] as const;
function section(module: string, level: number) {
  const top = module.split(".")[0];
  return level ? "local" : top === "__future__" ? "future" : STDLIB.has(top) ? "stdlib" : "third";
}

interface Straight { name: string; as: string | null; atop: string[]; inline: string[]; index: number }
interface FromGroup {
  module: string;
  level: number;
  aliases: Map<string, Alias>;
  atop: string[];
  inline: string[];
  trailing: string[];
  comma: boolean;
  index: number;
}

// One block's statements, merged as ruff's normalize_imports merges them (combine-as-imports off).
function normalize(statements: Statement[]) {
  const straight = new Map<string, Straight>();
  const from = new Map<string, FromGroup>();
  statements.forEach((s, index) => {
    if (!s.from) {
      s.aliases.forEach((a, i) => {
        const key = `${a.name} ${a.as}`;
        const entry = straight.get(key) ?? straight.set(key, { name: a.name, as: a.as, atop: [], inline: [], index }).get(key)!;
        if (i === 0) entry.atop.push(...s.atop), entry.inline.push(...s.inline);
      });
      return;
    }
    const group = (a: Alias) => {
      const kind = a.name === "*" ? "*" : a.as === null ? "" : `${a.name} ${a.as}`;
      const key = `${s.level} ${s.module} ${kind}`;
      return from.get(key) ?? from.set(key, { module: s.module, level: s.level, aliases: new Map(), atop: [], inline: [], trailing: [], comma: false, index }).get(key)!;
    };
    const head = group(s.aliases[0]);
    head.atop.push(...s.atop);
    head.inline.push(...s.inline);
    head.trailing.push(...s.trailing);
    for (const a of s.aliases) {
      const g = group(a);
      const key = `${a.name} ${a.as}`;
      const entry = g.aliases.get(key) ?? g.aliases.set(key, { ...a, atop: [], inline: [], trailing: [] }).get(key)!;
      entry.atop.push(...a.atop);
      entry.inline.push(...a.inline);
      entry.trailing.push(...a.trailing);
      if (s.comma) g.comma = true;
    }
  });
  return { straight: [...straight.values()], from: [...from.values()] };
}

const suffix = (comments: string[]) => comments.map((c) => "  " + c).join("");

function formatStraight(s: Straight, first: boolean) {
  const out = !first && s.atop.length ? [""] : [];
  out.push(...s.atop, `import ${s.name}${s.as ? ` as ${s.as}` : ""}${suffix(s.inline)}`);
  return out;
}

function formatFrom(g: FromGroup, aliases: Alias[], first: boolean, indent: string, unit: string) {
  const out = !first && g.atop.length ? [""] : [];
  out.push(...g.atop);
  const head = `from ${".".repeat(g.level)}${g.module} import `;
  const names = aliases.map((a) => a.name + (a.as ? ` as ${a.as}` : ""));
  const star = aliases.some((a) => a.name === "*");
  const plain = aliases.length === 1 || aliases.every((a) => !a.atop.length && !a.inline.length && !a.trailing.length);
  if ((aliases.length === 1 && star) || (!g.comma && plain)) {
    const line = head + names.join(", ") + suffix(g.inline) + suffix(aliases.flatMap((a) => [...a.atop, ...a.inline, ...a.trailing])) + suffix(g.trailing);
    if (star || [...indent + line].length <= LINE_LENGTH) return [...out, line];
  }
  out.push(head + "(" + suffix(g.inline));
  aliases.forEach((a, i) => {
    out.push(...a.atop.map((c) => unit + c), unit + names[i] + "," + suffix(a.inline), ...a.trailing.map((c) => unit + c));
  });
  out.push(")" + suffix(g.trailing));
  return out;
}

// One block's lines as ruff writes them, without the block's indentation.
function format(statements: Statement[], indent: string, unit: string) {
  const { straight, from } = normalize(statements);
  const out: string[] = [];
  for (const name of SECTIONS) {
    const imports = straight
      .filter((s) => section(s.name, 0) === name)
      .map((s) => ({ key: [...moduleKey(s.name, s.as, 0, null), s.index], lines: (first: boolean) => formatStraight(s, first) }));
    const froms = from
      .filter((g) => section(g.module, g.level) === name)
      .map((g) => {
        const aliases = [...g.aliases.values()].sort((a, b) => compare(memberKey(a.name, a.as), memberKey(b.name, b.as)));
        const key = [...moduleKey(g.module || null, null, g.level, memberKey(aliases[0].name, aliases[0].as)), g.index];
        return { key, lines: (first: boolean) => formatFrom(g, aliases, first, indent, unit) };
      });
    const byKey = (a: { key: Key }, b: { key: Key }) => compare(a.key, b.key);
    imports.sort(byKey);
    froms.sort(byKey);
    const ordered = name === "future" ? [...froms, ...imports] : [...imports, ...froms];
    if (!ordered.length) continue;
    if (out.length) out.push("");
    ordered.forEach((s, i) => out.push(...s.lines(i === 0)));
  }
  return out;
}

const blank = (s: string) => !s.trim();

// Blank lines ruff puts after a top-level block, by the statement that follows it: two before a
// def or class, unless a comment set apart by a blank line comes between (has_comment_break),
// else one.
function linesAfter(lines: string[], next: Logical) {
  if (!/^(?:@|def\s|async\s+def\s|class\s)/.test(lines[next.start])) return 1;
  let seenBlank = false;
  for (let n = next.start - 1; n >= 0; n--) {
    const line = lines[n].trim();
    if (seenBlank) {
      if (line.startsWith("#")) return 1;
      if (line) break;
    } else if (!line) seenBlank = true;
    else if (!/^[#@]/.test(line)) break;
  }
  return 2;
}

// The buffer with every import block sorted; for each old line, the new line it became, or for a
// line in a sorted block, the line at the same offset in the new block; and how many blocks were
// left as they are because a line in them holds more than one statement and a comment.
export function organizeImports(lines: string[]) {
  const { logicals, comments } = scan(lines);
  const unit = logicals.find((l) => l.indent)?.indent ?? "    ";
  const out: string[] = [];
  const lineMap: number[] = [];
  let copied = 0; // lines before this index are in out
  const copy = (to: number) => {
    for (; copied < to; copied++) lineMap.push(out.push(lines[copied]) - 1);
  };
  let skipped = 0;
  let block: { logicals: Logical[]; statements: Statement[]; ok: boolean } | null = null;

  const finish = (next: Logical | undefined) => {
    if (!block) return;
    const first = block.logicals[0], last = block.logicals.at(-1)!;
    let end = last.end + 1;
    const after = next && !first.indent ? linesAfter(lines, next) : 0;
    if (after) while (blank(lines[end])) end++;
    copy(first.start);
    if (block.ok) {
      const start = out.length;
      out.push(...format(block.statements, first.indent, unit).map((s) => (s ? first.indent + s : s)));
      for (let i = 0; i < after; i++) out.push("");
      for (; copied < end; copied++) lineMap.push(Math.min(start + copied - first.start, out.length - 1));
    } else {
      skipped++;
      copy(end);
    }
    block = null;
  };

  for (const logical of logicals) {
    const statements = parse(logical);
    if (!statements) {
      finish(logical);
      continue;
    }
    if (!statements.length) continue; // a backslash before a blank line: nothing, as in Python
    if (block && block.logicals[0].indent !== logical.indent) finish(logical);
    block ??= { logicals: [], statements: [], ok: true };
    // Comment lines since the previous statement go above this one; before the first, they stay.
    const prev = block.logicals.at(-1);
    const atop = prev ? [...comments.entries()].filter(([n]) => n > prev.end && n < logical.start).map(([, c]) => c) : [];
    const hasComments = logical.lines.some((l) => l.comment);
    if (statements.length > 1 && hasComments) block.ok = false;
    if (statements.length === 1) annotate(statements[0], logical);
    statements[0].atop = atop;
    block.logicals.push(logical);
    block.statements.push(...statements);
  }
  finish(undefined);
  copy(lines.length);
  return { lines: out, lineMap, skipped };
}
