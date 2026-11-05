const KEY = "expenseSplitterData";

let state;
try {
  state = JSON.parse(localStorage.getItem(KEY)) || { members: [], expenses: [] };
} catch {
  state = { members: [], expenses: [] };
}

const $ = (id) => document.getElementById(id);
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

const toCents = (amount) => Math.round(amount * 100);
const fmt = (cents) => (cents / 100).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

const memberName = (id) => (state.members.find((m) => m.id === id) || { name: "Unknown" }).name;

/* ---------- Calculations ---------- */

// Net balance per member in cents: positive = is owed money, negative = owes money
function computeBalances() {
  const bal = {};
  state.members.forEach((m) => (bal[m.id] = 0));

  state.expenses.forEach((e) => {
    const parts = e.participants.filter((id) => id in bal);
    if (!parts.length || !(e.payer in bal)) return;

    const total = toCents(e.amount);
    const base = Math.floor(total / parts.length);
    let remainder = total - base * parts.length;

    parts.forEach((id) => {
      const share = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      bal[id] -= share;
    });
    bal[e.payer] += total;
  });

  return bal;
}

// Greedy matching of debtors to creditors to minimise payments
function computeSettlements(bal) {
  const creditors = [];
  const debtors = [];
  Object.entries(bal).forEach(([id, v]) => {
    if (v > 0) creditors.push({ id, v });
    else if (v < 0) debtors.push({ id, v: -v });
  });

  const result = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    result.push({ from: debtors[i].id, to: creditors[j].id, cents: pay });
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return result;
}

/* ---------- Rendering ---------- */

function renderMembers() {
  $("memberList").innerHTML = state.members.length
    ? state.members.map((m) => `
        <span class="chip">${esc(m.name)}
          <button data-id="${m.id}" title="Remove">&times;</button>
        </span>`).join("")
    : `<p class="empty">No members yet. Add people to start splitting.</p>`;

  $("expPayer").innerHTML = state.members.map((m) =>
    `<option value="${m.id}">${esc(m.name)}</option>`).join("");

  $("splitList").innerHTML = state.members.map((m) => `
    <label><input type="checkbox" value="${m.id}" checked> ${esc(m.name)}</label>`).join("")
    || `<p class="empty">Add members first.</p>`;

  $("memberCount").textContent = state.members.length;
}

function renderSummary() {
  const total = state.expenses.reduce((s, e) => s + toCents(e.amount), 0);
  $("totalSpent").textContent = fmt(total);
  $("totalCount").textContent = state.expenses.length;
}

function renderBalances() {
  const bal = computeBalances();
  const rows = state.members.map((m) => {
    const v = bal[m.id];
    const cls = v > 0 ? "pos" : v < 0 ? "neg" : "";
    const label = v > 0 ? "is owed" : v < 0 ? "owes" : "settled";
    return `<div class="bal-row">
      <span>${esc(m.name)} <span class="tag">${label}</span></span>
      <span class="${cls}">${fmt(Math.abs(v))}</span>
    </div>`;
  });
  $("balanceList").innerHTML = rows.join("") || `<p class="empty">No balances yet.</p>`;
}

function renderSettlements() {
  const list = computeSettlements(computeBalances());
  $("settleList").innerHTML = list.length
    ? list.map((s) => `
        <div class="settle-row">
          <strong>${esc(memberName(s.from))}</strong> pays
          <strong>${esc(memberName(s.to))}</strong>
          <span class="pos">${fmt(s.cents)}</span>
        </div>`).join("")
    : `<p class="empty">Everyone is settled up.</p>`;
}

function renderExpenses() {
  const q = $("searchExp").value.trim().toLowerCase();
  const rows = state.expenses
    .filter((e) => !q || e.desc.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));

  $("expBody").innerHTML = rows.length
    ? rows.map((e) => `
        <tr>
          <td>${esc(e.date)}</td>
          <td>${esc(e.desc)}</td>
          <td><span class="tag">${esc(e.category)}</span></td>
          <td>${esc(memberName(e.payer))}</td>
          <td>${e.participants.length} people</td>
          <td class="right">${fmt(toCents(e.amount))}</td>
          <td><button class="btn-danger" data-id="${e.id}">Delete</button></td>
        </tr>`).join("")
    : `<tr><td colspan="7" class="empty">No expenses found.</td></tr>`;
}

function renderAll() {
  renderMembers();
  renderSummary();
  renderBalances();
  renderSettlements();
  renderExpenses();
}

/* ---------- Actions ---------- */

$("memberForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("memberName").value.trim();
  if (!name) return;
  state.members.push({ id: Date.now().toString(), name });
  save();
  e.target.reset();
  renderAll();
});

$("memberList").addEventListener("click", (e) => {
  if (!e.target.matches("button[data-id]")) return;
  const id = e.target.dataset.id;
  const used = state.expenses.some((x) => x.payer === id || x.participants.includes(id));
  if (used) {
    alert("This member is part of existing expenses. Delete those expenses first.");
    return;
  }
  state.members = state.members.filter((m) => m.id !== id);
  save();
  renderAll();
});

$("expenseForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const participants = [...document.querySelectorAll("#splitList input:checked")].map((c) => c.value);
  if (!state.members.length) return alert("Add members first.");
  if (!participants.length) return alert("Select at least one person to split with.");

  state.expenses.push({
    id: Date.now().toString(),
    desc: $("expDesc").value.trim(),
    amount: parseFloat($("expAmount").value),
    payer: $("expPayer").value,
    category: $("expCategory").value,
    date: $("expDate").value,
    participants
  });
  save();
  e.target.reset();
  $("expDate").value = new Date().toISOString().slice(0, 10);
  renderAll();
});

$("expBody").addEventListener("click", (e) => {
  if (!e.target.matches("button[data-id]")) return;
  if (!confirm("Delete this expense?")) return;
  state.expenses = state.expenses.filter((x) => x.id !== e.target.dataset.id);
  save();
  renderAll();
});

$("searchExp").addEventListener("input", renderExpenses);

$("exportBtn").addEventListener("click", () => {
  const rows = [["Date", "Description", "Category", "Paid by", "Amount", "Split among"]];
  state.expenses.forEach((e) => rows.push([
    e.date, e.desc, e.category, memberName(e.payer),
    e.amount.toFixed(2), e.participants.map(memberName).join("; ")
  ]));
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "expenses.csv";
  a.click();
});

$("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
});

/* ---------- Init ---------- */

document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";
$("expDate").value = new Date().toISOString().slice(0, 10);
renderAll();