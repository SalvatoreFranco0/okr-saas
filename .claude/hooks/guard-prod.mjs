// Barriera anti-produzione. Legge il comando Bash da stdin; exit 2 = blocca.
// Compila .claude/refs.json con i project ref (non sono segreti) a fine Fase 0.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const refsPath = join(here, "..", "refs.json");
const refs = existsSync(refsPath) ? JSON.parse(readFileSync(refsPath, "utf8")) : {};

let input = "";
for await (const chunk of process.stdin) input += chunk;
let cmd = "";
try { cmd = JSON.parse(input)?.tool_input?.command ?? ""; } catch { process.exit(0); }

const block = (why) => { console.error(`BLOCCATO: ${why}`); process.exit(2); };

if (refs.prod && cmd.includes(refs.prod))
  block("il comando cita il project ref di PRODUZIONE. Prod si modifica solo da GitHub Actions.");

if (/supabase[^\n]*--project-ref/.test(cmd) && refs.dev && !cmd.includes(refs.dev))
  block("--project-ref diverso da dev. In locale è consentito solo okr-saas-dev.");

if (/supabase\s+link/.test(cmd) && refs.dev && !cmd.includes(refs.dev))
  block("supabase link consentito solo verso il progetto dev.");

if (/(service_role|SERVICE_ROLE)/.test(cmd) && /(echo|print|cat|type)/.test(cmd))
  block("non stampare chiavi service_role.");

if (!refs.dev || !refs.prod)
  console.error("AVVISO: .claude/refs.json non compilato; le barriere sui project ref sono incomplete.");
