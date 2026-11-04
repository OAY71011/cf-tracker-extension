const storage = new StorageManager();
const api = new CFAPI(storage);

let state = {
	contests: [],
	students: {},
	advancedRules: []
};

document.addEventListener('DOMContentLoaded', async () => {
	await loadState();
	setupNavigation();
	setupEventListeners();
	renderContestsView();
	renderAdvancedRulesView();
	updateVariableReference();
	renderDashboard();
});

async function loadState() {
	state.contests = await storage.get('tracker_contests', []);
	state.students = await storage.get('tracker_students', {});
	state.advancedRules = await storage.get('tracker_adv_rules', []);

	const creds = await storage.getCredentials();
	if (document.getElementById('api-key')) document.getElementById('api-key').value = creds.apiKey;
	if (document.getElementById('api-secret')) document.getElementById('api-secret').value = creds.apiSecret;
}

async function saveState() {
	await storage.set('tracker_contests', state.contests);
	await storage.set('tracker_students', state.students);
	await storage.set('tracker_adv_rules', state.advancedRules);
}

// --- Navigation & Events ---
function setupNavigation() {
	document.querySelectorAll('#nav-links li').forEach(li => {
		li.addEventListener('click', (e) => {
			document.querySelectorAll('#nav-links li').forEach(el => el.classList.remove('active'));
			document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
			e.target.classList.add('active');
			document.getElementById(e.target.dataset.target).classList.add('active');
			if (e.target.dataset.target === 'advanced') updateVariableReference();
		});
	});
}

function setupEventListeners() {
	document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
	document.getElementById('btn-add-contest').addEventListener('click', addContest);
	document.getElementById('btn-refresh').addEventListener('click', syncData);
	document.getElementById('filter-passed-only').addEventListener('change', renderDashboard);
	document.getElementById('btn-export-csv').addEventListener('click', exportCSV);

	document.getElementById('btn-test-rule').addEventListener('click', validateAdvancedRule);
	document.getElementById('btn-save-rule').addEventListener('click', saveAdvancedRule);
}

// --- Settings ---
async function saveSettings() {
	const key = document.getElementById('api-key').value.trim();
	const secret = document.getElementById('api-secret').value.trim();
	await storage.saveCredentials(key, secret);
	const status = document.getElementById('settings-status');
	status.textContent = 'Credentials saved successfully!';
	status.style.color = 'green';
	setTimeout(() => status.textContent = '', 3000);
}

// --- Contest Management ---
async function addContest() {
	const input = document.getElementById('new-contest-id');
	const contestId = input.value.trim();
	if (!contestId || isNaN(contestId)) return alert('Enter a valid numeric Contest ID');
	if (state.contests.find(c => c.id === contestId)) return alert('Contest already tracked');

	try {
		input.disabled = true;
		const data = await api.getContestStandings(contestId);

		state.contests.push({
			id: contestId,
			name: data.contest.name,
			reqType: 'solved',
			minSolved: 1,
			active: true
		});

		await processStandingsData(contestId, data.rows);
		await saveState();

		input.value = '';
		updateVariableReference();
		renderContestsView();
		renderDashboard();
	} catch (err) {
		alert(`Failed to add contest: ${err.message}`);
	} finally {
		input.disabled = false;
	}
}

function renderContestsView() {
	const list = document.getElementById('contests-list');
	list.innerHTML = '';

	state.contests.forEach((contest, index) => {
		const card = document.createElement('div');
		card.className = 'contest-card';
		card.innerHTML = `
      <div>
        <h3>${contest.name} (ID: ${contest.id})</h3>
        <div style="margin-top: 10px; display:flex; gap:10px; align-items:center;">
          <label><input type="checkbox" class="contest-active-cb" data-idx="${index}" ${contest.active ? 'checked' : ''}> Track Basic</label>
          <select class="contest-req-select" data-idx="${index}">
            <option value="registered" ${contest.reqType === 'registered' ? 'selected' : ''}>Must Register</option>
            <option value="participated" ${contest.reqType === 'participated' ? 'selected' : ''}>Must Participate (>=1 attempt)</option>
            <option value="solved" ${contest.reqType === 'solved' ? 'selected' : ''}>Must Solve >= N (In-Contest Only)</option>
          </select>
          <input type="number" class="contest-min-input" data-idx="${index}" value="${contest.minSolved}" min="1" 
                 style="width: 60px; ${contest.reqType !== 'solved' ? 'display:none;' : ''}">
        </div>
      </div>
      <button class="btn danger btn-remove-contest" data-idx="${index}">Remove</button>
    `;
		list.appendChild(card);
	});

	document.querySelectorAll('.contest-active-cb').forEach(cb => {
		cb.addEventListener('change', (e) => {
			state.contests[e.target.dataset.idx].active = e.target.checked;
			saveState().then(renderDashboard);
		});
	});

	document.querySelectorAll('.contest-req-select').forEach(sel => {
		sel.addEventListener('change', (e) => {
			const idx = e.target.dataset.idx;
			state.contests[idx].reqType = e.target.value;
			const minInput = document.querySelector(`.contest-min-input[data-idx="${idx}"]`);
			minInput.style.display = e.target.value === 'solved' ? 'inline-block' : 'none';
			saveState().then(renderDashboard);
		});
	});

	document.querySelectorAll('.contest-min-input').forEach(inp => {
		inp.addEventListener('change', (e) => {
			state.contests[e.target.dataset.idx].minSolved = parseInt(e.target.value) || 1;
			saveState().then(renderDashboard);
		});
	});

	document.querySelectorAll('.btn-remove-contest').forEach(btn => {
		btn.addEventListener('click', async (e) => {
			if (confirm('Remove this contest and its data?')) {
				state.contests.splice(e.target.dataset.idx, 1);
				await saveState();
				updateVariableReference();
				renderContestsView();
				renderDashboard();
			}
		});
	});
}

// --- Data Fetching & Sync (UPDATED FOR UPSOLVING) ---
async function syncData() {
	const btn = document.getElementById('btn-refresh');
	btn.textContent = 'Syncing...';
	btn.disabled = true;

	try {
		for (const contest of state.contests) {
			const data = await api.getContestStandings(contest.id);
			await processStandingsData(contest.id, data.rows);
		}
		await saveState();
		renderDashboard();
		alert('Data synchronized successfully.');
	} catch (err) {
		alert(`Sync failed: ${err.message}`);
	} finally {
		btn.textContent = 'Sync Data';
		btn.disabled = false;
	}
}

async function processStandingsData(contestId, rows) {
	// Group rows by student handle to capture both CONTESTANT and PRACTICE modes
	const userRows = {};
	rows.forEach(row => {
		const handle = row.party.members[0].handle;
		if (!userRows[handle]) userRows[handle] = [];
		userRows[handle].push(row);
	});

	Object.keys(userRows).forEach(handle => {
		let attemptsCount = 0;
		const inContestSolved = new Set();
		const totalSolved = new Set();

		userRows[handle].forEach(row => {
			const pType = row.party.participantType;
			// PRACTICE is out-of-contest (upsolving). Everything else is in-contest/official
			const isInContest = pType !== 'PRACTICE';

			row.problemResults.forEach((pr, idx) => {
				if (pr.rejectedAttemptCount > 0 || pr.points > 0) attemptsCount++;
				if (pr.points > 0) {
					totalSolved.add(idx);
					if (isInContest) inContestSolved.add(idx);
				}
			});
		});

		if (!state.students[handle]) state.students[handle] = {};

		state.students[handle][contestId] = {
			registered: true,
			participated: attemptsCount > 0,
			solvedCount: inContestSolved.size,
			upsolveCount: totalSolved.size - inContestSolved.size,
			totalSolvedCount: totalSolved.size
		};
	});
}

// --- Advanced Conditions (UPDATED FOR UPSOLVING) ---
function buildEnvironment(studentData) {
	const env = {};
	state.contests.forEach(c => {
		const sd = studentData[c.id] || { registered: false, participated: false, solvedCount: 0, upsolveCount: 0, totalSolvedCount: 0 };
		env[`solved_${c.id}`] = sd.solvedCount || 0;
		env[`upsolve_${c.id}`] = sd.upsolveCount || 0;
		env[`total_solved_${c.id}`] = sd.totalSolvedCount || 0;
		env[`attempted_${c.id}`] = sd.participated;
		env[`registered_${c.id}`] = sd.registered;
	});
	return env;
}

function updateVariableReference() {
	const list = document.getElementById('var-ref-list');
	list.innerHTML = '';
	state.contests.forEach(c => {
		[`solved_${c.id}`, `upsolve_${c.id}`, `total_solved_${c.id}`, `attempted_${c.id}`, `registered_${c.id}`].forEach(varName => {
			const badge = document.createElement('div');
			badge.className = 'var-badge';
			badge.textContent = varName;
			badge.title = `Contest: ${c.name}`;
			badge.onclick = () => {
				const textarea = document.getElementById('adv-rule-expr');
				textarea.value += (textarea.value.endsWith(' ') || textarea.value === '' ? '' : ' ') + varName;
				textarea.focus();
			};
			list.appendChild(badge);
		});
	});
}

function validateAdvancedRule() {
	const expr = document.getElementById('adv-rule-expr').value;
	const consoleEl = document.getElementById('adv-console');
	try {
		const dummyEnv = buildEnvironment({});
		const result = ExprParser.run(expr, dummyEnv);
		consoleEl.className = 'console success';
		consoleEl.textContent = `Syntax OK. Evaluates to: ${result} (with zeroed test data)`;
		return true;
	} catch (err) {
		consoleEl.className = 'console error';
		consoleEl.textContent = `Error: ${err.message}`;
		return false;
	}
}

async function saveAdvancedRule() {
	if (!validateAdvancedRule()) return;
	const name = document.getElementById('adv-rule-name').value.trim() || `Rule ${state.advancedRules.length + 1}`;
	const expr = document.getElementById('adv-rule-expr').value.trim();

	state.advancedRules.push({ id: Date.now(), name, expr, active: true });
	await saveState();

	document.getElementById('adv-rule-name').value = '';
	document.getElementById('adv-rule-expr').value = '';
	document.getElementById('adv-console').textContent = 'Rule saved.';
	document.getElementById('adv-console').className = 'console success';

	renderAdvancedRulesView();
	renderDashboard();
}

function renderAdvancedRulesView() {
	const list = document.getElementById('saved-rules-list');
	list.innerHTML = '';
	state.advancedRules.forEach((rule, index) => {
		const card = document.createElement('div');
		card.className = 'rule-card';
		card.innerHTML = `
      <div>
        <strong>${rule.name}</strong> <label style="margin-left: 10px; font-size: 0.9em;"><input type="checkbox" class="rule-active-cb" data-idx="${index}" ${rule.active ? 'checked' : ''}> Active</label>
        <code>${rule.expr}</code>
      </div>
      <button class="btn danger btn-remove-rule" data-idx="${index}">Delete</button>
    `;
		list.appendChild(card);
	});

	document.querySelectorAll('.rule-active-cb').forEach(cb => {
		cb.addEventListener('change', async (e) => {
			state.advancedRules[e.target.dataset.idx].active = e.target.checked;
			await saveState();
			renderDashboard();
		});
	});

	document.querySelectorAll('.btn-remove-rule').forEach(btn => {
		btn.addEventListener('click', async (e) => {
			state.advancedRules.splice(e.target.dataset.idx, 1);
			await saveState();
			renderAdvancedRulesView();
			renderDashboard();
		});
	});
}

// --- Dashboard & Filtering Evaluation (UPDATED UI FOR UPSOLVES) ---
function evaluateStudent(studentData) {
	const activeContests = state.contests.filter(c => c.active);
	const activeRules = state.advancedRules.filter(r => r.active);

	let passedBasic = true;
	let passedAdvanced = true;
	const results = {};
	const ruleResults = {};

	activeContests.forEach(c => {
		const sd = studentData[c.id] || { registered: false, participated: false, solvedCount: 0, upsolveCount: 0 };
		let passed = false;

		// Basic rules ONLY evaluate in-contest solves, advanced rules can use upsolves
		if (c.reqType === 'registered' && sd.registered) passed = true;
		else if (c.reqType === 'participated' && sd.participated) passed = true;
		else if (c.reqType === 'solved' && sd.solvedCount >= c.minSolved) passed = true;

		if (!passed) passedBasic = false;

		// Format the text output to show upsolves nicely
		let textOut = '';
		if (c.reqType === 'solved') {
			const upTxt = sd.upsolveCount > 0 ? ` (+${sd.upsolveCount} up)` : '';
			textOut = `Solved: ${sd.solvedCount}${upTxt}/${c.minSolved}`;
		} else if (c.reqType === 'participated') {
			textOut = sd.participated ? 'Attempted' : 'No Sub';
		} else {
			textOut = sd.registered ? 'Reg' : 'Not Reg';
		}

		results[c.id] = { passed, text: textOut };
	});

	if (activeRules.length > 0) {
		const env = buildEnvironment(studentData);
		activeRules.forEach(rule => {
			try {
				const passed = Boolean(ExprParser.run(rule.expr, env));
				ruleResults[rule.id] = { passed, error: null };
				if (!passed) passedAdvanced = false;
			} catch (err) {
				ruleResults[rule.id] = { passed: false, error: err.message };
				passedAdvanced = false;
			}
		});
	}

	const passedAll = passedBasic && passedAdvanced;
	return { passedAll, passedBasic, passedAdvanced, results, ruleResults };
}

function renderDashboard() {
	const headRow = document.getElementById('table-head-row');
	const tbody = document.getElementById('table-body');
	const showPassedOnly = document.getElementById('filter-passed-only').checked;
	const activeContests = state.contests.filter(c => c.active);
	const activeRules = state.advancedRules.filter(r => r.active);

	headRow.innerHTML = '<th>#</th><th>Student Handle</th>';
	activeContests.forEach(c => {
		const th = document.createElement('th');
		th.textContent = `${c.name} (Basic)`;
		headRow.appendChild(th);
	});
	activeRules.forEach(r => {
		const th = document.createElement('th');
		th.textContent = `Rule: ${r.name}`;
		headRow.appendChild(th);
	});
	headRow.innerHTML += '<th>Overall Status (AND)</th>';

	tbody.innerHTML = '';
	const handles = Object.keys(state.students).sort((a, b) => a.localeCompare(b.toLowerCase()));

	let rowIndex = 1;

	handles.forEach(handle => {
		const evalResult = evaluateStudent(state.students[handle]);

		if (showPassedOnly && !evalResult.passedAll) return;

		const tr = document.createElement('tr');
		let html = `<td>${rowIndex++}</td><td><strong>${handle}</strong></td>`;

		activeContests.forEach(c => {
			const res = evalResult.results[c.id];
			html += `<td class="${res.passed ? 'status-pass' : 'status-fail'}">${res.text}</td>`;
		});

		activeRules.forEach(r => {
			const res = evalResult.ruleResults[r.id];
			html += `<td class="${res.passed ? 'status-pass' : 'status-fail'}">${res.error ? 'ERR' : (res.passed ? 'PASS' : 'FAIL')}</td>`;
		});

		html += `<td class="${evalResult.passedAll ? 'status-pass' : 'status-fail'}">${evalResult.passedAll ? 'QUALIFIED' : 'FAILED'}</td>`;
		tr.innerHTML = html;
		tbody.appendChild(tr);
	});
}

function exportCSV() {
	const activeContests = state.contests.filter(c => c.active);
	const activeRules = state.advancedRules.filter(r => r.active);
	const showPassedOnly = document.getElementById('filter-passed-only').checked;

	let csvContent = "#,Student Handle,";
	activeContests.forEach(c => csvContent += `"${c.name} (Basic)",`);
	activeRules.forEach(r => csvContent += `"Rule: ${r.name}",`);
	csvContent += "Overall Final Status\n";

	const handles = Object.keys(state.students).sort((a, b) => a.localeCompare(b.toLowerCase()));

	let rowIndex = 1;

	handles.forEach(handle => {
		const evalResult = evaluateStudent(state.students[handle]);
		if (showPassedOnly && !evalResult.passedAll) return;

		let row = `"${rowIndex++}","${handle}",`;
		activeContests.forEach(c => {
			const res = evalResult.results[c.id];
			row += `"${res.text} (${res.passed ? 'PASS' : 'FAIL'})",`;
		});
		activeRules.forEach(r => {
			const res = evalResult.ruleResults[r.id];
			row += `"${res.error ? 'ERR' : (res.passed ? 'PASS' : 'FAIL')}",`;
		});
		row += `"${evalResult.passedAll ? 'QUALIFIED' : 'FAILED'}"\n`;
		csvContent += row;
	});

	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement("a");
	link.setAttribute("href", URL.createObjectURL(blob));
	link.setAttribute("download", `CF_Progress_Export_${new Date().toISOString().split('T')[0]}.csv`);
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}