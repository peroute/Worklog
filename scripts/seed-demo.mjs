// Fills the LOCAL Supabase with demo data so the UI has something to show.
// Usage: npm run seed:demo   (needs `npx supabase start` + `npm run env:local`, and the
// test accounts, which `npm run test:integration` creates).
// Wipes existing projects first. Never point this at production: it uses the service role key.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.test', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)
if (!env.VITE_SUPABASE_URL?.startsWith('http://127.0.0.1')) {
  console.error('Refusing to seed: .env.test does not point at the local stack.')
  process.exit(1)
}
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function must({ data, error }, what) {
  if (error) {
    console.error(`Failed to ${what}:`, error.message)
    process.exit(1)
  }
  return data
}

const centralDate = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d)
}
const today = centralDate(0)
const yesterday = centralDate(-1)
const inAWeek = centralDate(7)

const profiles = must(await admin.from('profiles').select('id, display_name'), 'load profiles')
const byName = (name) => profiles.find((p) => p.display_name === name)?.id
const [creator, hedi, khaushik] = ['Lead', 'Hedi', 'Khaushik'].map(byName)
if (!creator || !hedi || !khaushik) {
  console.error('Test accounts missing. Run `npm run test:integration` once to create them.')
  process.exit(1)
}

must(await admin.from('projects').delete().not('id', 'is', null), 'clear projects')

const [qa, research] = must(
  await admin
    .from('projects')
    .insert([
      { name: 'Mobile App QA', description: 'Android + iOS release testing', created_by: creator },
      { name: 'Vendor Research', description: 'Comparing auth vendors', created_by: creator },
    ])
    .select('id, name'),
  'create projects',
)

// Bulk inserts send null for columns a row omits (not the default), so give every row every column.
const task = (row) => ({ explanation: null, deadline: null, status: 'todo', needs_review: false, blocked_reason: null, submitted_by: null, approved_by: null, created_by: creator, ...row })
const finding = (row) => ({ task_id: null, status: 'open', fixed_by: null, ...row })

const tasks = must(
  await admin
    .from('tasks')
    .insert([
      task({ project_id: qa.id, title: 'Retest login flow', explanation: 'Android 13 and 14.\nUse a fresh install.', assigned_to: hedi, deadline: yesterday, created_by: creator, status: 'in_progress' }),
      task({ project_id: qa.id, title: 'Smoke test build 1.4', assigned_to: hedi, deadline: today, created_by: creator, status: 'waiting_for_review', needs_review: true, submitted_by: hedi }),
      task({ project_id: research.id, title: 'Compare vendor pricing', assigned_to: hedi, deadline: inAWeek, created_by: creator }),
      task({ project_id: qa.id, title: 'Push notification test', assigned_to: khaushik, created_by: creator, status: 'done', needs_review: true, submitted_by: khaushik, approved_by: creator }),
      task({ project_id: research.id, title: 'Audit SSO support', explanation: 'Check SAML + OIDC.', assigned_to: khaushik, created_by: creator, status: 'blocked', blocked_reason: 'Waiting on vendor sandbox access' }),
    ])
    .select('id, title'),
  'create tasks',
)
const taskId = (title) => tasks.find((t) => t.title === title).id

const findings = must(
  await admin.from('findings').insert([
    finding({ project_id: qa.id, task_id: taskId('Retest login flow'), title: 'Login crashes on Android 13', explanation: 'Steps:\n1. Fresh install\n2. Tap "Sign in with Google"\n3. App closes', finding_date: today, author_id: hedi, status: 'needs_info' }),
    finding({ project_id: research.id, title: 'Vendor A has no SSO on the basic plan', explanation: 'SSO only on Enterprise ($$$).', finding_date: today, author_id: hedi, status: 'not_a_bug' }),
    finding({ project_id: qa.id, task_id: taskId('Push notification test'), title: 'Push notifications arrive ~30s late', explanation: 'Measured 10 sends, median 31s.', finding_date: today, status: 'fixed', fixed_by: creator, author_id: khaushik }),
    finding({ project_id: qa.id, title: 'Checkout button misaligned on small screens', explanation: 'iPhone SE: button overlaps the total.', finding_date: yesterday, author_id: hedi, status: 'verified', fixed_by: khaushik }),
  ]).select('id, title'),
  'create findings',
)
const findingId = (title) => findings.find((f) => f.title === title).id

// Review threads (the admin key bypasses the guards, so statuses above can be set directly).
// Spaced timestamps: a bulk insert would otherwise give every comment the same instant.
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString()
must(
  await admin.from('comments').insert([
    { finding_id: findingId('Login crashes on Android 13'), author_id: creator, body: 'Can you attach the logcat output? I need the stack trace.', created_at: minutesAgo(50) },
    { finding_id: findingId('Login crashes on Android 13'), author_id: hedi, body: 'On it, reproducing on the Pixel now.', created_at: minutesAgo(40) },
    { finding_id: findingId('Push notifications arrive ~30s late'), author_id: creator, body: 'Is this on Wi-Fi or cellular?', created_at: minutesAgo(30) },
    { finding_id: findingId('Push notifications arrive ~30s late'), author_id: khaushik, body: 'Both. Added the numbers for each.', created_at: minutesAgo(20) },
    { task_id: taskId('Retest login flow'), author_id: creator, body: 'Please also cover Android 14 before this goes to review.', created_at: minutesAgo(10) },
  ]),
  'create comments',
)

// Sample PDF + Word attachments, generated here so the repo holds no binary fixtures.
function samplePdf(lines) {
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 72 ${720 - i * 28} Td (${l}) Tj ET`).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((body, i) => {
    const at = pdf.length
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Blob([pdf], { type: 'application/pdf' })
}

async function sampleDocx(title, paragraphs) {
  const { default: JSZip } = await import('jszip') // installed with docx-preview
  const p = (t, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="2F5496"/></w:rPr></w:style></w:styles>')
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p(title, 'Heading1')}${paragraphs.map((t) => p(t)).join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

const attachments = [
  { title: 'Retest login flow', fileName: 'Login test plan.pdf', uploadedBy: creator, kind: 'brief',
    blob: samplePdf(['Login test plan', 'Devices: Pixel 7 (Android 13), Pixel 8 (Android 14)', '1. Fresh install from the release build', '2. Sign in with Google', '3. Expect: home screen within 3 seconds']) },
  { title: 'Retest login flow', fileName: 'Release notes 1.4.docx', uploadedBy: creator, kind: 'brief',
    blob: await sampleDocx('Release notes 1.4', ['New: Sign in with Google on Android.', 'Fixed: checkout button overlapping the total on small screens.', 'Known issue: push notifications can arrive about 30 seconds late.']) },
  { title: 'Smoke test build 1.4', fileName: 'Smoke test report.docx', uploadedBy: hedi, kind: 'proof',
    blob: await sampleDocx('Smoke test report: build 1.4', ['All 24 smoke checks passed on Android 14.', 'One flaky check (deep link from email) passed on retry.']) },
]
for (const [position, a] of attachments.entries()) {
  const path = `tasks/${taskId(a.title)}/${crypto.randomUUID()}.${a.fileName.split('.').pop()}`
  must(await admin.storage.from('task-attachments').upload(path, a.blob, { contentType: a.blob.type }), `upload ${a.fileName}`)
  must(
    await admin.from('task_attachments').insert({ task_id: taskId(a.title), storage_path: path, file_name: a.fileName, mime_type: a.blob.type, size_bytes: a.blob.size, position, uploaded_by: a.uploadedBy, kind: a.kind }),
    `record ${a.fileName}`,
  )
}

console.log(`Seeded 2 projects, ${tasks.length} tasks, ${findings.length} findings, 5 comments, ${attachments.length} attachments (today = ${today}).`)
