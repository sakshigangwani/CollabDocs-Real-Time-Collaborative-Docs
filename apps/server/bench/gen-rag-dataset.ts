// Generates the RAG eval corpus + questions with gpt-4o-mini (run once; output is
// committed as bench/rag-dataset.json so the eval is reproducible without regenerating).
// Workspace A = docs the eval user can read. Workspace B = a different company the
// eval user must never see: 10 docs on the same topics as A (hard distractors) and
// 10 docs on B-only topics (used for the ACL-leakage test).
import { writeFileSync } from "node:fs";
import OpenAI from "openai";

const openai = new OpenAI();
const A_CO = "Larkspur Robotics", B_CO = "Tidewater Analytics";
const A_TOPICS = [
  "Payments service architecture", "On-call runbook: search cluster", "Postmortem: checkout outage in March",
  "Q3 OKRs for the mobile team", "Parental leave policy", "Vendor security review process", "Customer data retention policy",
  "Kafka migration plan", "Design doc: feature flag service", "Expense reimbursement policy", "Warehouse robot firmware release process",
  "Incident severity levels and escalation", "New engineer onboarding checklist", "API rate limiting design", "Database backup and restore runbook",
  "Remote work and travel policy", "Design doc: fleet telemetry pipeline", "Hiring loop for backend engineers", "Postmortem: firmware rollback in the Denver warehouse",
  "Performance review cycle", "Mobile app release checklist", "Design doc: robot path-planning service", "Cloud cost optimization plan",
  "Access control and SSO policy", "Customer support escalation guide", "Battery safety procedures for AMR robots", "Design doc: notification service",
  "Quarterly all-hands notes: Q2", "Open source contribution policy", "Postmortem: telemetry data loss", "Load testing guidelines",
  "Design doc: multi-region failover", "Engineering career ladder", "Security incident response plan", "Pricing tiers for the fleet management product",
  "Design doc: map versioning for warehouses", "Holiday code freeze policy", "Machine learning model deployment process", "Office relocation plan: Austin", "Accessibility guidelines for the dashboard",
];
const B_SHARED = A_TOPICS.slice(0, 10);
const B_ONLY = [
  "Project Heron launch plan", "Tidewater board meeting notes: May", "Acquisition due diligence: Coralline Data", "Design doc: tide forecasting model v4",
  "Sales commission plan", "Postmortem: Harborview dashboard outage", "Partnership agreement summary with Meridian Ports", "Design doc: sonar ingestion service",
  "Layoff communication plan (confidential)", "Executive compensation review",
];

async function gen(company: string, title: string, nq: number) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini", temperature: 0.7, max_tokens: 2500, frequency_penalty: 0.3, response_format: { type: "json_object" },
    messages: [{ role: "user", content: `Write a realistic internal company document for the fictional company "${company}" titled "${title}".
Plain prose paragraphs only (no markdown, no bullet symbols), about 700-900 words. Include many specific, concrete, made-up facts: numbers, thresholds, dates, owner names, tool names, durations.
Then write ${nq} question/answer pairs that an employee might ask whose answer is a specific fact stated in ONE sentence of the document.
Questions must be phrased naturally and PARAPHRASED - do not copy the distinctive wording of the evidence sentence, and do not mention the document title.
"evidence" must be ONE sentence copied EXACTLY, character for character, from the body.
Return JSON: {"body": string, "qa": [{"question": string, "answer": string, "evidence": string}]}` }],
  });
  return JSON.parse(res.choices[0].message.content!);
}
// Retry when the model returns truncated JSON or a degenerate (looping) body.
async function genOk(company: string, title: string, nq: number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await gen(company, title, nq);
      const sentences = norm(r.body).split(/(?<=[.!?])\s+/);
      if (new Set(sentences).size / sentences.length < 0.9) throw new Error("repetitive");
      if ((r.qa ?? []).length < nq) throw new Error("missing qa");
      return r;
    } catch (e) { process.stderr.write(`[retry ${title}: ${(e as Error).message.slice(0, 40)}]`); }
  }
  throw new Error(`failed: ${title}`);
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

const jobs = [
  ...A_TOPICS.map((t) => ({ ws: "A", company: A_CO, title: t, nq: 4 })),
  ...B_SHARED.map((t) => ({ ws: "B", company: B_CO, title: t, nq: 0 })),
  ...B_ONLY.map((t) => ({ ws: "B", company: B_CO, title: t, nq: 2 })),
];
const docs = await pool(jobs, 8, async (j) => {
  const r = await genOk(j.company, j.title, j.nq);
  const body = norm(r.body);
  // Evidence must be a real sentence of the body. If the model paraphrased it,
  // snap to the body sentence with the highest token overlap (>= 0.8), else drop.
  const sentences = body.split(/(?<=[.!?])\s+/);
  const toks = (x: string) => new Set(x.toLowerCase().match(/[a-z0-9$%.]+/g) ?? []);
  const qa = (r.qa ?? []).map((q: any) => {
    const ev = norm(q.evidence);
    if (body.includes(ev)) return { ...q, evidence: ev };
    const et = toks(ev);
    let best = "", score = 0;
    for (const s of sentences) { const st = toks(s); const inter = [...et].filter((t) => st.has(t)).length; const sc = inter / Math.max(et.size, 1); if (sc > score) { score = sc; best = s; } }
    return score >= 0.8 ? { ...q, evidence: best, evidenceSnapped: true } : null;
  }).filter(Boolean);
  process.stderr.write(".");
  return { ...j, body, qa, droppedQa: (r.qa?.length ?? 0) - qa.length };
});

// Unanswerable: plausible questions for this company that no document covers.
const unanswerable = [
  "What is the company's policy on bringing pets to the office?", "How many vacation days do interns get?", "What is the Wi-Fi password for the guest network?",
  "Who is the head of the legal department?", "What is the budget for the 2027 marketing campaign?", "Which health insurance provider does the company use?",
  "What programming language is the billing reconciliation job written in?", "When is the company holiday party this year?", "What is the parking reimbursement limit?",
  "How much did the company raise in its Series C?", "What is the gym membership stipend?", "Who approves conference talk submissions?",
  "What is the dress code for customer visits?", "What is the retention period for Slack messages?", "Which CRM does the sales team use?",
  "How are stock options vested for new hires?", "What is the maximum laptop replacement budget?", "What time does the cafeteria close?",
  "Who owns the partnership with the Chicago distribution center?", "What is the policy for sabbaticals after five years?",
];
writeFileSync(new URL("./rag-dataset.json", import.meta.url), JSON.stringify({ generatedWith: "gpt-4o-mini", A_CO, B_CO, docs, unanswerable }, null, 1));
console.error(`\n${docs.length} docs, answerable(A)=${docs.filter(d=>d.ws==="A").reduce((a,d)=>a+d.qa.length,0)}, leak(B-only)=${docs.filter(d=>d.ws==="B").reduce((a,d)=>a+d.qa.length,0)}, dropped(non-verbatim evidence)=${docs.reduce((a,d)=>a+d.droppedQa,0)}`);
