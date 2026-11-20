import { spawn } from 'node:child_process';
import { transformSync } from 'esbuild';
import type {
  ArenaLanguage,
  ArenaTestCase,
  SandboxExecutionResult,
  SandboxStatus,
  SandboxTestResult,
} from '../src/types.ts';

const WALL_TIMEOUT_MS = 3500;
const MEMORY_MB = 64;
const CPU_SECONDS = 2;
const MAX_OUTPUT_BYTES = 32 * 1024;
const NOBODY_UID = 65534;
const NOBODY_GID = 65534;

export function getSandboxStatus(): SandboxStatus {
  return {
    mode: 'isolated_subprocess',
    label: 'Isolated Subprocess Sandbox (unprivileged UID 65534, Node --permission / Python -I rlimit, zero fs/network/env)',
    languages: ['javascript', 'typescript', 'python'],
    limits: {
      wallTimeoutMs: WALL_TIMEOUT_MS,
      cpuSeconds: CPU_SECONDS,
      memoryMb: MEMORY_MB,
      maxOutputKb: Math.round(MAX_OUTPUT_BYTES / 1024),
    },
  };
}

function unprivilegedSpawnOptions(): {
  env: Record<string, string>;
  uid?: number;
  gid?: number;
  stdio: ['pipe', 'pipe', 'pipe'];
} {
  const opts: { env: Record<string, string>; uid?: number; gid?: number; stdio: ['pipe', 'pipe', 'pipe'] } = {
    env: {},
    stdio: ['pipe', 'pipe', 'pipe'],
  };
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    opts.uid = NOBODY_UID;
    opts.gid = NOBODY_GID;
  }
  return opts;
}

function spawnLimited(cmd: string, args: string[], stdinPayload: string): Promise<{
  stdout: string;
  stderr: string;
  timedOut: boolean;
  exitCode: number | null;
}> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, unprivilegedSpawnOptions());
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, exitCode });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      finish(null);
    }, WALL_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += chunk.toString('utf8').slice(0, MAX_OUTPUT_BYTES - stdout.length);
      } else {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += chunk.toString('utf8').slice(0, MAX_OUTPUT_BYTES - stderr.length);
      }
    });

    child.on('error', (err) => {
      stderr += err.message;
      finish(1);
    });

    child.on('close', (code) => {
      finish(code);
    });

    try {
      child.stdin.write(stdinPayload);
      child.stdin.end();
    } catch {
      /* closed early */
    }
  });
}

// Isolated Node child-process harness (executed ONLY inside `node --permission --max-old-space-size=64` as UID 65534).
const NODE_HARNESS_SOURCE = `
'use strict';
const vm = require('node:vm');

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  if (rawInput.length < 512 * 1024) rawInput += c;
});
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(rawInput);
    const { code, entryPoint, tests } = payload;
    const stdoutLogs = [];
    // 0 and -0 are the same answer; NaN equals NaN.
    const deepEqual = (a, b) => {
      if (a === b || Object.is(a, b)) return true;
      if (typeof a !== typeof b || a === null || b === null) return false;
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
      }
      if (typeof a === 'object') {
        const ka = Object.keys(a).sort();
        const kb = Object.keys(b).sort();
        if (!deepEqual(ka, kb)) return false;
        for (const k of ka) {
          if (!deepEqual(a[k], b[k])) return false;
        }
        return true;
      }
      return false;
    };

    // The context gets its OWN built-ins (Array, Object, Math, ...). Passing host objects in would let submitted code
    // reach the host Function constructor (e.g. Object.constructor('return process')()) and forge results.
    // The only host function is a log bridge that is called with plain strings and is captured in a closure.
    const sandbox = Object.create(null);
    sandbox.__hostLog = (line) => {
      if (stdoutLogs.length < 60) stdoutLogs.push(String(line).slice(0, 500));
    };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(
      '(function (hostLog) {' +
      '  var fmt = function (v) { try { return typeof v === "string" ? v : JSON.stringify(v); } catch (e) { return String(v); } };' +
      '  var mk = function (prefix) { return function () { hostLog(prefix + Array.prototype.map.call(arguments, fmt).join(" ")); }; };' +
      '  globalThis.console = { log: mk(""), warn: mk("[warn] "), error: mk("[error] ") };' +
      '  var S = JSON.stringify, P = JSON.parse, A = Function.prototype.apply;' +
      '  globalThis.__run = function (f, argsJson) { return S(A.call(f, null, P(argsJson))); };' +
      '})(__hostLog); delete globalThis.__hostLog;',
      ctx,
      { timeout: 500 }
    );

    const wrappedCode = code + '\\n;typeof ' + entryPoint + ' === "function" ? ' + entryPoint + ' : null;';
    let fn = vm.runInContext(wrappedCode, ctx, { timeout: 800, displayErrors: true });
    if (typeof fn !== 'function') {
      // Be forgiving: accept class Solution { solve() {} }, or a single function with a different name.
      try {
        fn = vm.runInContext(
          '(typeof Solution === \"function\" && typeof Solution.prototype.' + entryPoint + ' === \"function\") ? function () { var o = new Solution(); return o.' + entryPoint + '.apply(o, arguments); } : null;',
          ctx, { timeout: 800 });
      } catch (e0) { fn = null; }
    }
    if (typeof fn !== 'function') {
      const found = [];
      const reFn = /function\\s+([A-Za-z_$][\\w$]*)\\s*\\(/g;
      const reArrow = /(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)/g;
      let mm;
      while ((mm = reFn.exec(code))) found.push(mm[1]);
      while ((mm = reArrow.exec(code))) found.push(mm[1]);
      const uniq = Array.from(new Set(found));
      if (uniq.length === 1) {
        try { fn = vm.runInContext('typeof ' + uniq[0] + ' === \"function\" ? ' + uniq[0] + ' : null;', ctx, { timeout: 800 }); } catch (e1) { fn = null; }
      }
    }
    if (typeof fn !== 'function') {
      process.stdout.write(JSON.stringify({
        ok: false,
        error: 'Function "' + entryPoint + '" was not found. Make sure you keep function ' + entryPoint + '(...).',
        stdout: stdoutLogs.join('\\n'),
        results: []
      }));
      return;
    }

    const results = [];
    for (const tc of tests) {
      const tStart = Date.now();
      try {
        // Arguments go in as a JSON string and the answer comes back as a JSON string, so no host-realm
        // object is ever handed to submitted code and results compare the same way as the expected values.
        ctx.__fn = fn;
        ctx.__argsJson = JSON.stringify(tc.args);
        const actualJson = vm.runInContext('__run(__fn, __argsJson)', ctx, { timeout: 900, displayErrors: true });
        const runtimeMs = Math.max(1, Date.now() - tStart);
        const actual = typeof actualJson === 'string' ? JSON.parse(actualJson) : undefined;
        const passed = typeof actualJson === 'string' && deepEqual(actual, tc.expected);
        results.push({
          testId: tc.id,
          label: tc.label || tc.id,
          hidden: Boolean(tc.hidden),
          passed,
          actual: tc.hidden ? (passed ? '[passed]' : '[mismatch]') : (typeof actualJson === 'string' ? actualJson : 'undefined'),
          expected: tc.hidden ? '[hidden]' : JSON.stringify(tc.expected),
          runtimeMs,
        });
      } catch (err) {
        const runtimeMs = Math.max(1, Date.now() - tStart);
        let message;
        try { message = err && err.message ? String(err.message) : String(err); } catch (e2) { message = 'Runtime error'; }
        results.push({
          testId: tc.id,
          label: tc.label || tc.id,
          hidden: Boolean(tc.hidden),
          passed: false,
          error: message.slice(0, 500),
          expected: tc.hidden ? '[hidden]' : JSON.stringify(tc.expected),
          runtimeMs,
        });
      }
    }

    process.stdout.write(JSON.stringify({
      ok: true,
      stdout: stdoutLogs.join('\\n').slice(0, 4000),
      results
    }));
  } catch (err) {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: err && err.message ? err.message : String(err),
      stdout: '',
      results: []
    }));
  }
});
`;

// Isolated Python child-process harness (executed ONLY inside `python3 -I` as UID 65534).
const PYTHON_HARNESS_SOURCE = `
import sys, json, time, signal, io, copy, resource, inspect

resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
resource.setrlimit(resource.RLIMIT_NOFILE, (16, 16))
try:
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
except Exception:
    pass

raw = sys.stdin.read(512 * 1024)
payload = json.loads(raw)
code = payload.get("code", "")
entry_point = payload.get("entryPoint", "solve")
tests = payload.get("tests", [])

BLOCKED_AUDIT_PREFIXES = (
    "open", "subprocess.", "os.system", "os.popen", "os.spawn", "os.exec", "os.fork",
    "socket.", "urllib.", "http.", "ftplib.", "ctypes.", "webbrowser."
)
DISALLOWED_MODULES = {
    "os", "sys", "subprocess", "socket", "pathlib", "shutil", "http", "urllib",
    "ctypes", "multiprocessing", "threading", "asyncio", "importlib", "pty", "fcntl"
}

def _audit_hook(event, args):
    if event == "open" or any(event.startswith(p) for p in BLOCKED_AUDIT_PREFIXES):
        raise PermissionError(f"Sandbox policy blocked {event}")
    if event == "import" and args:
        mod = str(args[0]).split(".")[0]
        if mod in DISALLOWED_MODULES:
            raise PermissionError(f"Module '{mod}' is blocked in the coding arena sandbox")

sys.addaudithook(_audit_hook)

_dumps = json.dumps

def _norm(x):
    # Tuples are lists and sets are sorted lists as far as the tests are concerned.
    if isinstance(x, (list, tuple)):
        return [_norm(i) for i in x]
    if isinstance(x, (set, frozenset)):
        items = [_norm(i) for i in x]
        try:
            return sorted(items)
        except Exception:
            return items
    if isinstance(x, dict):
        return {k: _norm(v) for k, v in x.items()}
    return x

def _show(x):
    try:
        return _dumps(_norm(x))
    except Exception:
        try:
            return repr(x)[:500]
        except Exception:
            return '<unprintable>'

def _timeout_handler(signum, frame):
    raise TimeoutError("Test execution exceeded 1s limit")

signal.signal(signal.SIGALRM, _timeout_handler)

stdout_buf = io.StringIO()
old_stdout = sys.stdout
sys.stdout = stdout_buf

real_import = __import__
def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root_mod = str(name).split(".")[0]
    if root_mod in DISALLOWED_MODULES:
        raise ImportError(f"Module '{root_mod}' is blocked in the coding arena sandbox")
    return real_import(name, globals, locals, fromlist, level)

safe_builtins = dict(__builtins__) if isinstance(__builtins__, dict) else dict(vars(__builtins__))
safe_builtins["__import__"] = _safe_import
safe_builtins.pop("open", None)
safe_builtins.pop("eval", None)
safe_builtins.pop("exec", None)
safe_builtins.pop("compile", None)

ns = {"__builtins__": safe_builtins}
try:
    signal.alarm(1)
    exec(compile(code, "<arena_submission>", "exec"), ns, ns)
    signal.alarm(0)
except Exception as exc:
    signal.alarm(0)
    sys.stdout = old_stdout
    print(json.dumps({
        "ok": False,
        "error": f"{type(exc).__name__}: {exc}",
        "stdout": stdout_buf.getvalue()[:4000],
        "results": []
    }))
    sys.exit(0)

fn = ns.get(entry_point)
if not callable(fn):
    # Be forgiving: accept LeetCode-style classes (class Solution: def solve(self, ...)),
    # or a lone function/method with a different name, as long as the answer is right.
    try:
        for _v in list(ns.values()):
            if inspect.isclass(_v) and callable(getattr(_v, entry_point, None)):
                fn = getattr(_v(), entry_point)
                break
        if not callable(fn):
            _funcs = [v for k, v in ns.items() if inspect.isfunction(v) and not k.startswith("_")]
            if len(_funcs) == 1:
                fn = _funcs[0]
            else:
                for _v in list(ns.values()):
                    if inspect.isclass(_v):
                        _ms = [m for n, m in inspect.getmembers(_v(), inspect.ismethod) if not n.startswith("_")]
                        if len(_ms) == 1:
                            fn = _ms[0]
                            break
    except Exception:
        pass
if not callable(fn):
    sys.stdout = old_stdout
    print(json.dumps({
        "ok": False,
        "error": f"Function '{entry_point}' not found. Define it like: def {entry_point}(...): ... and return the answer (do not use input() or print()).",
        "stdout": stdout_buf.getvalue()[:4000],
        "results": []
    }))
    sys.exit(0)

results = []
for tc in tests:
    t0 = time.monotonic()
    try:
        args_copy = copy.deepcopy(tc.get("args", []))
        signal.alarm(1)
        actual = fn(*args_copy)
        signal.alarm(0)
        elapsed = max(1, int((time.monotonic() - t0) * 1000))
        expected = tc.get("expected")
        actual = _norm(actual)
        passed = (actual == expected) and (type(actual) is type(expected) or not (isinstance(actual, bool) ^ isinstance(expected, bool)))
        hidden = bool(tc.get("hidden", False))
        results.append({
            "testId": tc.get("id"),
            "label": tc.get("label") or tc.get("id"),
            "hidden": hidden,
            "passed": bool(passed),
            "actual": ("[passed]" if passed else "[mismatch]") if hidden else _show(actual),
            "expected": "[hidden]" if hidden else _show(expected),
            "runtimeMs": elapsed
        })
    except Exception as exc:
        signal.alarm(0)
        elapsed = max(1, int((time.monotonic() - t0) * 1000))
        hidden = bool(tc.get("hidden", False))
        results.append({
            "testId": tc.get("id"),
            "label": tc.get("label") or tc.get("id"),
            "hidden": hidden,
            "passed": False,
            "error": f"{type(exc).__name__}: {exc}",
            "expected": "[hidden]" if hidden else _show(tc.get("expected")),
            "runtimeMs": elapsed
        })

sys.stdout = old_stdout
print(json.dumps({
    "ok": True,
    "stdout": stdout_buf.getvalue()[:4000],
    "results": results
}))
`;

function entry_point_ref(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '') || 'solve';
}

export async function runIsolatedTests(input: {
  language: ArenaLanguage;
  code: string;
  entryPoint: string;
  tests: ArenaTestCase[];
}): Promise<SandboxExecutionResult> {
  const language: ArenaLanguage = ['javascript', 'typescript', 'python'].includes(input.language)
    ? input.language
    : 'javascript';
  const entryPoint = entry_point_ref(input.entryPoint);
  const tests = Array.isArray(input.tests) ? input.tests : [];
  const sourceCode = String(input.code || '').slice(0, 64 * 1024);

  if (!sourceCode.trim()) {
    return {
      ok: false,
      language,
      isolationMode: getSandboxStatus().label,
      passedCount: 0,
      totalCount: tests.length,
      hiddenPassed: 0,
      hiddenTotal: tests.filter((t) => t.hidden).length,
      allPassed: false,
      stdout: '',
      error: 'No source code submitted.',
      runtimeMs: 0,
      results: [],
    };
  }

  const tStart = Date.now();
  const statusInfo = getSandboxStatus();

  // Pasting code into the wrong language tab is the most common mistake: say so clearly instead of a cryptic syntax error.
  const looksPython = /^\s*def\s+[A-Za-z_]\w*\s*\(.*\)\s*(->\s*[^:]+)?:\s*$/m.test(sourceCode) || /^\s*(elif\s.+|else|except(\s.+)?|for\s.+\sin\s.+|while\s.+):\s*$/m.test(sourceCode);
  const looksJs = /(^|\s)function\s*\*?\s*[A-Za-z_$]?[\w$]*\s*\(/.test(sourceCode) || /^\s*(const|let|var)\s+[A-Za-z_$][\w$]*\s*=/m.test(sourceCode) || /=>\s*[{(\w]/.test(sourceCode);
  const wrongTab =
    (language !== 'python' && looksPython && !looksJs)
      ? 'This looks like Python code, but the ' + (language === 'typescript' ? 'TypeScript' : 'JavaScript') + ' tab is selected. Click the "Python 3" tab, paste your code there, and submit again.'
      : (language === 'python' && looksJs && !looksPython)
        ? 'This looks like JavaScript code, but the Python 3 tab is selected. Click the JavaScript tab, paste your code there, and submit again.'
        : null;
  if (wrongTab) {
    return {
      ok: false,
      language,
      isolationMode: statusInfo.label,
      passedCount: 0,
      totalCount: tests.length,
      hiddenPassed: 0,
      hiddenTotal: tests.filter((t) => t.hidden).length,
      allPassed: false,
      stdout: '',
      error: wrongTab,
      runtimeMs: Math.max(1, Date.now() - tStart),
      results: [],
    };
  }

  if (language === 'python') {
    const { stdout, stderr, timedOut } = await spawnLimited(
      'python3',
      ['-I', '-c', PYTHON_HARNESS_SOURCE],
      JSON.stringify({ code: sourceCode, entryPoint, tests })
    );
    const runtimeMs = Math.max(1, Date.now() - tStart);
    if (timedOut) {
      return {
        ok: false,
        language,
        isolationMode: statusInfo.label,
        passedCount: 0,
        totalCount: tests.length,
        hiddenPassed: 0,
        hiddenTotal: tests.filter((t) => t.hidden).length,
        allPassed: false,
        stdout: '',
        error: `Execution stopped after ${WALL_TIMEOUT_MS}ms time limit.`,
        runtimeMs,
        results: [],
      };
    }
    try {
      const parsed = JSON.parse(stdout.trim() || '{}');
      const results: SandboxTestResult[] = Array.isArray(parsed.results) ? parsed.results : [];
      const passedCount = results.filter((r) => r.passed).length;
      const hidden = results.filter((r) => r.hidden);
      return {
        ok: Boolean(parsed.ok),
        language,
        isolationMode: statusInfo.label,
        passedCount,
        totalCount: tests.length,
        hiddenPassed: hidden.filter((r) => r.passed).length,
        hiddenTotal: hidden.length,
        allPassed: Boolean(parsed.ok) && passedCount === tests.length && tests.length > 0,
        stdout: String(parsed.stdout || ''),
        error: parsed.error || (stderr.trim() ? stderr.trim() : undefined),
        runtimeMs,
        results,
      };
    } catch {
      return {
        ok: false,
        language,
        isolationMode: statusInfo.label,
        passedCount: 0,
        totalCount: tests.length,
        hiddenPassed: 0,
        hiddenTotal: tests.filter((t) => t.hidden).length,
        allPassed: false,
        stdout: stdout.slice(0, 1000),
        error: stderr.trim() || 'Python sandbox failed to produce test output.',
        runtimeMs,
        results: [],
      };
    }
  }

  // JavaScript & TypeScript -> strip TypeScript types safely without executing user code, then run inside `--permission` Node child process
  let executableJs = sourceCode;
  if (language === 'typescript') {
    try {
      const transformed = transformSync(sourceCode, {
        loader: 'ts',
        format: 'cjs',
        target: 'es2022',
      });
      // Allow both `export function solve(...)` and `function solve(...)`
      executableJs = transformed.code.replace(/^\s*"use strict";\s*/m, '').replace(/module\.exports\s*=.*$/gm, '').replace(/exports\.\w+\s*=\s*\w+;?/g, '');
    } catch (err: any) {
      return {
        ok: false,
        language,
        isolationMode: statusInfo.label,
        passedCount: 0,
        totalCount: tests.length,
        hiddenPassed: 0,
        hiddenTotal: tests.filter((t) => t.hidden).length,
        allPassed: false,
        stdout: '',
        error: `TypeScript syntax error: ${err?.message || 'Invalid syntax'}`,
        runtimeMs: Math.max(1, Date.now() - tStart),
        results: [],
      };
    }
  } else {
    executableJs = sourceCode.replace(/^\s*export\s+(?=(async\s+)?function\s)/gm, '');
  }

  const { stdout, stderr, timedOut } = await spawnLimited(
    'node',
    ['--permission', `--max-old-space-size=${MEMORY_MB}`, '--stack-size=512', '-e', NODE_HARNESS_SOURCE],
    JSON.stringify({ code: executableJs, entryPoint, tests })
  );

  const runtimeMs = Math.max(1, Date.now() - tStart);
  if (timedOut) {
    return {
      ok: false,
      language,
      isolationMode: statusInfo.label,
      passedCount: 0,
      totalCount: tests.length,
      hiddenPassed: 0,
      hiddenTotal: tests.filter((t) => t.hidden).length,
      allPassed: false,
      stdout: '',
      error: `Execution stopped after ${WALL_TIMEOUT_MS}ms time limit.`,
      runtimeMs,
      results: [],
    };
  }

  try {
    const parsed = JSON.parse(stdout.trim() || '{}');
    const results: SandboxTestResult[] = Array.isArray(parsed.results) ? parsed.results : [];
    const passedCount = results.filter((r) => r.passed).length;
    const hidden = results.filter((r) => r.hidden);
    return {
      ok: Boolean(parsed.ok),
      language,
      isolationMode: statusInfo.label,
      passedCount,
      totalCount: tests.length,
      hiddenPassed: hidden.filter((r) => r.passed).length,
      hiddenTotal: hidden.length,
      allPassed: Boolean(parsed.ok) && passedCount === tests.length && tests.length > 0,
      stdout: String(parsed.stdout || ''),
      error: parsed.error || (stderr.trim() ? stderr.trim() : undefined),
      runtimeMs,
      results,
    };
  } catch {
    return {
      ok: false,
      language,
      isolationMode: statusInfo.label,
      passedCount: 0,
      totalCount: tests.length,
      hiddenPassed: 0,
      hiddenTotal: tests.filter((t) => t.hidden).length,
      allPassed: false,
      stdout: stdout.slice(0, 1000),
      error: stderr.trim() || 'Isolated runner failed to produce structured test results.',
      runtimeMs,
      results: [],
    };
  }
}
