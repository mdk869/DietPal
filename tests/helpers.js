// Loads selected top-level declarations from app.js (a browser script) into a sandbox for unit tests.
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// Text of a top-level `function name(` or `const name =` declaration (ends at the next line that starts a new top-level statement).
function decl(name) {
  const re = new RegExp(`^(function ${name}\\(|const ${name} =)`, 'm');
  const m = re.exec(SRC); if (!m) throw new Error('not found in app.js: ' + name);
  const rest = SRC.slice(m.index);
  const end = rest.slice(1).search(/\n(?=(function |const |let |var |\/\/|\/\*|[a-zA-Z_$][\w$.]*\(|document\.|window\.|if \())/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

function load(names, globals = {}) {
  const code = names.map(decl).join('\n').replace(/^const /gm, 'var ');
  const ctx = vm.createContext({ structuredClone, console, Date, Math, ...globals });
  vm.runInContext(code, ctx);
  return ctx;
}
module.exports = { load, decl };
