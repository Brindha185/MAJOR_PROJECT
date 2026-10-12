// Static knowledge the UI needs per attack type: plain-English description,
// MITRE mapping, and the automatic response chain (mirrors config.RESPONSE_MATRIX).
// Warm palette (mirrors the CSS variables in modern.css).
export const THEME = {
  accent: '#e3a857', ok: '#9ccf8f', ink: '#f4eadb', dim: '#ad9d89',
  panel: '#251e18', panel2: '#2f261e', line: '#473a2e', lineIdle: '#5a4a3b',
}
export const SEV_COLOR = {
  CRITICAL: '#ea5a4f', HIGH: '#f0914a', MEDIUM: '#efc15a', LOW: '#93c98a', INFO: '#c9a27f',
}
export const SEV_ORDER = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
export const TACTICS = ['Discovery', 'Initial Access', 'Execution', 'Persistence',
  'Lateral Movement', 'Exfiltration', 'Impact', 'Other']

const A = (label, tactic, tech, techName, desc, rsp) => ({ label, tactic, tech, techName, desc, rsp })

export const ATTACK_INFO = {
  PortScan: A('Port Scan', 'Discovery', 'T1046', 'Network Service Scanning',
    'Probing many ports to map which services are open',
    ['Block source IP for 24h', 'Medium alert', 'Log flow']),
  BruteForce: A('Brute Force', 'Initial Access', 'T1110', 'Brute Force',
    'Repeated password guesses against a login',
    ['Block source IP for 1h', 'Kill sessions', 'Medium alert']),
  Honeypot: A('Honeypot Hit', 'Initial Access', 'T1110', 'Brute Force',
    'Touched a decoy service — 100% malicious by design',
    ['Block source IP', 'Capture PCAP', 'Critical alert', 'Profile attacker']),
  Phishing: A('Phishing', 'Initial Access', 'T1566', 'Phishing',
    'Request mimicking a trusted brand or a suspicious link',
    ['Block domain', 'Medium alert', 'Notify admin']),
  SQLInjection: A('SQL Injection', 'Execution', 'T1190', 'Exploit Public-Facing Application',
    'Database commands smuggled into a web request',
    ['Block request', 'Medium alert', 'Log payload']),
  XSS: A('XSS', 'Execution', 'T1059.007', 'JavaScript',
    'Malicious script injected into a web page',
    ['Sanitise input', 'Block request', 'Medium alert']),
  CommandInject: A('Command Injection', 'Execution', 'T1059', 'Command and Scripting Interpreter',
    'Operating-system commands slipped into web input',
    ['Block request', 'Block source IP for 1h', 'High alert']),
  WebShell: A('Web Shell', 'Persistence', 'T1505.003', 'Server Software Component: Web Shell',
    'Backdoor file uploaded to run remote commands',
    ['Block request', 'Block source IP', 'Critical alert']),
  Bot: A('Bot / C2 Beacon', 'Persistence', 'T1543', 'Create or Modify System Process',
    'Regular check-ins to a command-and-control server',
    ['Block source IP', 'Block C2 domain', 'High alert']),
  Infiltration: A('Infiltration', 'Lateral Movement', 'T1078', 'Valid Accounts',
    'Internal reconnaissance and movement inside the network',
    ['Isolate connection', 'Critical alert', 'Capture PCAP']),
  Exfiltration: A('Exfiltration', 'Exfiltration', 'T1041', 'Exfiltration Over C2 Channel',
    'Unusually large data transfer out of the server',
    ['Log for review']),
  DoS: A('DoS Flood', 'Impact', 'T1499', 'Endpoint Denial of Service',
    'One source flooding the server with connections',
    ['Rate limit', 'Block source IP', 'High alert', 'Capture PCAP']),
  DDoS: A('DDoS', 'Impact', 'T1498', 'Network Denial of Service',
    'Several sources flooding the server together',
    ['Rate limit', 'Block source IP', 'High alert', 'Capture PCAP']),
  Heartbleed: A('Heartbleed', 'Other', 'T1600', 'Weaken Encryption',
    'TLS memory-leak exploitation attempt',
    ['Block TLS', 'Critical alert', 'Notify to patch']),
  PathTraversal: A('Path Traversal', 'Other', '', 'Unmapped',
    'Climbing out of the web root to read system files',
    ['Block request', 'Block source IP for 1h']),
  CSRF: A('CSRF', 'Other', '', 'Unmapped',
    "Forged request riding a victim's logged-in session",
    ['Kill the session (no IP block: the source is the victim)']),
  'Session Hijacking': A('Session Hijacking', 'Other', '', 'Unmapped',
    'A stolen session cookie replayed from another machine',
    ['Kill the session (no IP block)']),
  ZeroDay: A('Zero-Day / Anomaly', 'Other', 'T1203', 'Exploitation for Client Execution',
    'Traffic unlike anything seen before',
    ['Quarantine', 'Critical alert', 'Capture everything']),
  ATTACK: A('Attack (unclassified)', 'Other', '', 'Unmapped',
    'Flagged malicious by the ML model, type not named',
    ['Log and alert']),
}

export const infoFor = (name) =>
  ATTACK_INFO[name] || A(name, 'Other', '', 'Unmapped',
    'Suspicious activity flagged by SENTINEL', ['Log and alert'])

const PRETTY = {
  rate_limit: 'Rate limit', ip_block: 'Block IP', ip_block_1h: 'Block IP 1h',
  ip_block_24h: 'Block IP 24h', alert_high: 'High alert', alert_medium: 'Medium alert',
  alert_critical: 'Critical alert', log_pcap: 'Capture PCAP', log: 'Log',
  block_request: 'Block request', sanitize_input: 'Sanitise input',
  log_payload: 'Log payload', invalidate_session: 'Kill session',
  invalidate_sessions: 'Kill sessions', block_domain: 'Block domain',
  notify_admin: 'Notify admin', c2_domain_block: 'Block C2 domain',
  isolate_connection: 'Isolate connection', block_tls: 'Block TLS',
  patch_notify: 'Notify to patch', quarantine: 'Quarantine', capture_all: 'Capture all',
  retrain: 'Retrain', forensics_mode: 'Forensics mode', isolate_full: 'Isolate',
}

export const responseText = (row) =>
  row.actions && row.actions.length
    ? row.actions.map((a) => PRETTY[a] || a).join(' · ')
    : row.action || 'Logged'

// MITRE technique to display: backend value when mapped, else the static one.
export const techniqueOf = (row) => {
  const t = row.technique
  return t && t !== 'T0000' ? t : infoFor(row.attack).tech
}
