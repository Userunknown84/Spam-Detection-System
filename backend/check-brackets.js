const fs = require('fs');
const file = process.argv[2];
const code = fs.readFileSync(file, 'utf8');

let line = 1;
let stack = [];
let inString = null;
let inLineComment = false;
let inBlockComment = false;

for (let i = 0; i < code.length; i++) {
  const c = code[i];
  const next = code[i + 1];

  if (c === '\n') {
    line++;
    inLineComment = false;
    continue;
  }

  if (inLineComment) continue;

  if (inBlockComment) {
    if (c === '*' && next === '/') { inBlockComment = false; i++; }
    continue;
  }

  if (inString) {
    if (c === '\\') { i++; continue; }
    if (c === inString) inString = null;
    continue;
  }

  if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
  if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
  if (c === '"' || c === "'" || c === '`') { inString = c; continue; }

  if (c === '{' || c === '(' || c === '[') {
    stack.push({ char: c, line });
  } else if (c === '}' || c === ')' || c === ']') {
    const pair = { '}': '{', ')': '(', ']': '[' };
    const top = stack.pop();
    if (!top || top.char !== pair[c]) {
      console.log(`Mismatch at line ${line}: found '${c}' but expected closer for '${top ? top.char : 'nothing'}' opened at line ${top ? top.line : '?'}`);
    }
  }
}

console.log('\nUnclosed brackets remaining (these are your problem spots):');
stack.forEach(item => console.log(`  '${item.char}' opened at line ${item.line} — never closed`));
