/* Dokapon Kingdom Tools - Save Editor
 * Edit Dokapon Kingdom: Connect (PC) gameNN.dat save files directly in the browser.
 * Format: 01 01 01 01 | 4 obfuscated u16 words | u32 checksum | obfuscated gzip(JSON + NUL).
 * Dependency: Tabulator 6 (already loaded by the page). Classic script; no build step required. */
(() => {
	'use strict';

	/* ======================================================================
	 * 1. CODEC .dat <-> JSON
	 * ==================================================================== */
	const K11 = 0xef310a9d;
	const K10 = 0x1ed595fd;
	const rol8 = (x) => ((x << 8) | (x >>> 24)) >>> 0;

	async function gzip(bytes, Stream) {
		const stream = new Blob([bytes]).stream().pipeThrough(new Stream('gzip'));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	}

	const isDat = (u8) => u8.length >= 16 && u8[0] === 1 && u8[1] === 1 && u8[2] === 1 && u8[3] === 1;

	/** Uint8Array (.dat) -> string (JSON) */
	async function decodeSave(input) {
		const d = new Uint8Array(input);
		if (!isDat(d)) throw new Error("This is not a .dat save file (missing 01 01 01 01 header).");
		const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
		let r11 = K11;
		let r10 = K10;
		const w4 = (v.getUint16(4, true) - (r10 & 0xffff)) & 0xffff;
		r10 = rol8(r10);
		const a = r10 & 0xffff;
		r10 = rol8(r10);
		const w6 = (v.getUint16(6, true) + a) & 0xffff;
		const w8 = (v.getUint16(8, true) - (r10 & 0xffff)) & 0xffff;
		r10 = rol8(r10);
		const w10 = (v.getUint16(10, true) + (r10 & 0xffff)) & 0xffff;
		const chk = ((((w4 + w8) & 0xffff) << 16) | ((w6 + w10) & 0xffff)) >>> 0;
		if (chk !== v.getUint32(12, true)) throw new Error("Invalid header checksum: the file is corrupted or uses an unknown format.");
		const n = w8;
		const words = (n + 1) >> 1;
		if (d.length < 16 + words * 2) throw new Error('Truncated file.');
		const body = new Uint8Array(words * 2);
		const bv = new DataView(body.buffer);
		for (let i = 0; i < words; i++) {
			const w = v.getUint16(16 + 2 * i, true);
			const k = r11 & 0xffff;
			bv.setUint16(2 * i, (i & 1 ? w + k : w - k) & 0xffff, true);
			r11 = rol8(r11);
		}
		const raw = await gzip(body.subarray(0, n), DecompressionStream);
		let end = raw.length;
		while (end > 0 && raw[end - 1] === 0) end--;
		return new TextDecoder().decode(raw.subarray(0, end));
	}

	/** string (JSON) -> Uint8Array (.dat) */
	async function encodeSave(jsonText) {
		JSON.parse(jsonText); // refuse un JSON invalide
		const src = new TextEncoder().encode(jsonText);
		const raw = new Uint8Array(src.length + 1);
		raw.set(src); // octet nul final, comme le jeu
		const z = await gzip(raw, CompressionStream);
		const n = z.length;
		if (n > 0xffff) throw new Error('Data is too large after compression (format limit: 65,535 bytes).');
		const body = new Uint8Array(n + (n & 1));
		body.set(z);
		const bv = new DataView(body.buffer);
		const out = new Uint8Array(16 + body.length);
		const ov = new DataView(out.buffer);
		let r11 = K11;
		const s = [0, 0];
		for (let i = 0; i < body.length / 2; i++) {
			const x = bv.getUint16(2 * i, true);
			const k = r11 & 0xffff;
			s[i & 1] = (s[i & 1] + x) & 0xffff;
			ov.setUint16(16 + 2 * i, (i & 1 ? x - k : x + k) & 0xffff, true);
			r11 = rol8(r11);
		}
		const w4 = s[1], w6 = s[0], w8 = n, w10 = 0;
		const chk = ((((w4 + w8) & 0xffff) << 16) | ((w6 + w10) & 0xffff)) >>> 0;
		let r10 = K10;
		out.set([1, 1, 1, 1]);
		ov.setUint16(4, (w4 + (r10 & 0xffff)) & 0xffff, true);
		r10 = rol8(r10);
		ov.setUint16(6, (w6 - (r10 & 0xffff)) & 0xffff, true);
		r10 = rol8(r10);
		ov.setUint16(8, (w8 + (r10 & 0xffff)) & 0xffff, true);
		r10 = rol8(r10);
		ov.setUint16(10, (w10 - (r10 & 0xffff)) & 0xffff, true);
		ov.setUint32(12, chk, true);
		return out;
	}

	/* ======================================================================
	 * 2. Utilities
	 * ==================================================================== */
	const $ = (sel, root = document) => root.querySelector(sel);
	const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
	const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().trim(); // ＣＯＧＯ == cogo
	const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
	const clone = (o) => JSON.parse(JSON.stringify(o));
	const fmtBytes = (n) => (n < 1024 ? `${n} o` : `${(n / 1024).toFixed(1)} Ko`);
	const baseName = (name) => name.replace(/\.(dat|json)$/i, '');

	function el(tag, props = {}, ...kids) {
		const e = document.createElement(tag);
		for (const [k, v] of Object.entries(props)) {
			if (v === undefined || v === null || v === false) continue;
			if (k === 'class') e.className = v;
			else if (k === 'text') e.textContent = v;
			else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
			else if (k === 'dataset') Object.assign(e.dataset, v);
			else e.setAttribute(k, v === true ? '' : v);
		}
		for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
		return e;
	}

	const getPath = (root, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), root);
	function setPath(root, path, value) {
		const parent = getPath(root, path.slice(0, -1));
		if (parent == null) throw new Error('Path not found: ' + pstr(path));
		parent[path[path.length - 1]] = value;
	}
	const pstr = (path) => path.reduce((s, k) => (typeof k === 'number' ? `${s}[${k}]` : s ? `${s}.${k}` : k), '');

	function flatten(o, path = [], out = []) {
		if (o !== null && typeof o === 'object') {
			if (Array.isArray(o)) o.forEach((v, i) => flatten(v, [...path, i], out));
			else for (const k of Object.keys(o)) flatten(o[k], [...path, k], out);
		} else out.push({ path, value: o });
		return out;
	}

	function download(content, filename, mime) {
		const blob = new Blob([content], { type: mime });
		const a = el('a', { href: URL.createObjectURL(blob), download: filename });
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(a.href), 4000);
	}

	/* ======================================================================
	 * 3. State
	 * ==================================================================== */
	const S = {
		data: null, // JSON currently being edited
		orig: null, // copie intacte
		origFlat: null, // Map of paths to original values
		origText: '', // Original JSON text
		origBytes: null, // Original .dat bytes (if loaded from a .dat file)
		kind: null, // 'dat' | 'json'
		name: '',
		size: 0,
		mode: 'default',
		changes: new Map(),
		table: null,
		focusIdx: null,
	};

	const CSAVE = ['SAVESLOTDATA', 'CSaveInfo'];
	const hasSave = () => Array.isArray(getPath(S.data, [...CSAVE, 'mPlayerInfo']));
	const playerCount = () => (hasSave() ? getPath(S.data, [...CSAVE, 'mPlayerInfo']).length : 0);
	const playerName = (i) => String(getPath(S.data, [...CSAVE, 'mPlayerInfo', i, 'mName', 'mName_String']) ?? '');
	const players = () =>
		Array.from({ length: playerCount() }, (_, i) => ({ i, name: playerName(i) })).filter((p) => p.name.trim() !== '');

	/* ---------- messages ---------- */
	let statusTimer = null;
	function toast(msg, kind = 'ok') {
		const box = $('#dktStatus');
		box.textContent = msg;
		box.className = 'dkStatus is-' + kind;
		box.hidden = false;
		clearTimeout(statusTimer);
		if (kind !== 'err') statusTimer = setTimeout(() => (box.hidden = true), 6000);
	}

	/* ---------- Change tracking ---------- */
	function refreshChanges() {
		const cur = new Map(flatten(S.data).map((l) => [pstr(l.path), l.value]));
		S.changes.clear();
		for (const [k, v] of cur) if (!S.origFlat.has(k) || S.origFlat.get(k) !== v) S.changes.set(k, { old: S.origFlat.get(k), now: v });
		for (const [k, v] of S.origFlat) if (!cur.has(k)) S.changes.set(k, { old: v, now: undefined });
		renderChanges();
		$$('#dktView [data-label]').forEach((n) => n.classList.toggle('is-modified', S.changes.has(n.dataset.label)));
	}

	function renderChanges() {
		const n = S.changes.size;
		$('#dktChangeCount').textContent = n;
		$('#dktChanges summary b').textContent = n === 0 ? 'No changes' : n === 1 ? '1 change' : `${n} changes`;
		const ul = $('#dktChangeList');
		ul.replaceChildren();
		let i = 0;
		for (const [k, c] of S.changes) {
			if (i++ >= 300) {
				ul.append(el('li', { class: 'muted', text: `… et ${n - 300} autres` }));
				break;
			}
			ul.append(
				el('li', {}, el('code', { text: k }), ' : ', el('s', { text: String(c.old) }), ' → ', el('b', { text: String(c.now) })),
			);
		}
		$('#dktResetAll').disabled = n === 0;
	}

	function commit(path, value) {
		setPath(S.data, path, value);
		refreshChanges();
	}

	/* ======================================================================
	 * 4. Tabulator: shared value editor
	 * ==================================================================== */
	const hasTabulator = () => typeof window.Tabulator === 'function';

	function destroyTable() {
		if (S.table) {
			try {
				S.table.destroy();
			} catch (e) {}
			S.table = null;
		}
	}

	/** Custom editor: number, text, or boolean depending on the current value type */
	function valueEditor(cell, onRendered, success, cancel) {
		const current = cell.getValue();
		let input;
		if (typeof current === 'boolean') {
			input = el('select', {}, el('option', { value: 'true', text: 'true' }), el('option', { value: 'false', text: 'false' }));
			input.value = String(current);
		} else {
			input = el('input', { type: typeof current === 'number' ? 'number' : 'text', value: current ?? '' });
			if (typeof current === 'number') input.step = Number.isInteger(current) ? '1' : 'any';
		}
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			if (typeof current === 'boolean') return success(input.value === 'true');
			if (typeof current === 'number') {
				const n = Number(input.value);
				if (input.value.trim() === '' || !Number.isFinite(n)) return cancel();
				if (Number.isInteger(current) && !Number.isInteger(n)) {
					toast('An integer value is required.', 'warn');
					return cancel();
				}
				return success(n);
			}
			success(input.value);
		};
		onRendered(() => {
			input.focus();
			if (input.select) input.select();
		});
		input.addEventListener('blur', finish);
		input.addEventListener('change', () => input.tagName === 'SELECT' && finish());
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') finish();
			if (e.key === 'Escape') {
				done = true;
				cancel();
			}
		});
		return input;
	}

	function valueFormatter(cell) {
		const v = cell.getValue();
		const d = cell.getRow().getData();
		cell.getElement().classList.toggle('is-modified', !!d.label && S.changes.has(d.label));
		if (typeof v === 'boolean') return `<span class="bool ${v}">${v}</span>`;
		return esc(v ?? '');
	}

	const valueColumn = (extra = {}) => ({
		title: 'Value',
		field: 'value',
		width: 200,
		headerSort: false,
		editor: valueEditor,
		formatter: valueFormatter,
		cssClass: 'cellValue',
		cellEdited: (cell) => {
			const d = cell.getRow().getData();
			commit(d.path, cell.getValue());
			cell.getElement().classList.toggle('is-modified', S.changes.has(d.label));
			if (S.mode === 'focus') renderPlayerChips();
		},
		...extra,
	});

	function buildTable(host, data, columns, extra = {}) {
		destroyTable();
		if (!hasTabulator()) {
			host.replaceChildren(el('p', { class: 'dkEmpty', text: 'Tabulator could not be loaded (is the CDN unavailable?).' }));
			return null;
		}
		const t = new Tabulator(host, {
			data,
			columns,
			index: 'id',
			layout: 'fitColumns',
			height: '560px',
			placeholder: 'No data',
			movableColumns: false,
			resizableColumns: false,
			...extra,
		});
		S.table = t;
		return t;
	}

	const groupHeader = (value, count) => `${esc(value)} <span class="count">${count}</span>`;

	/* ======================================================================
	 * 5. Known labels (useful fields)
	 * ==================================================================== */
	const STAT = ['ATK', 'DEF', 'MAG', 'SPD', 'PV']; // likely order (based on monster mBaseAp)

	function playerRows(i) {
		const base = [...CSAVE, 'mPlayerInfo', i];
		const rows = [];
		const add = (group, name, rel, hint = '') => {
			const path = [...base, ...rel];
			const value = getPath(S.data, path);
			if (value === undefined) return;
			rows.push({ id: pstr(path), label: pstr(path), group, name, hint, path, value });
		};
		add('Identity', 'Nickname', ['mName', 'mName_String'], 'text (full-width characters are supported)');
		add('Identity', 'Gender (ID)', ['mSexID']);
		add('Identity', 'Color (ID)', ['mColorID']);
		add('Identity', 'Face (ID)', ['mFaceGrpID']);
		add('Identity', 'CPU Level', ['mCpuLevel'], '0 = human player (likely)');
		add('Progression', 'Gold', ['mGold']);
		add('Progression', 'Level', ['mLevel']);
		add('Progression', 'Experience', ['mExp']);
		add('Progression', 'Class (ID)', ['mClassID']);
		add('Progression', 'Ability (ID)', ['mAbility']);
		add('Progression', 'Alchemy', ['mAlchemy']);
		add('Progression', 'Specialty', ['mSpecialty']);
		add('Stats', 'Current HP', ['mParam', 'mHp']);
		STAT.forEach((s, k) => add('Stats', `Bonus ${k + 1}`, ['mAddAp', k], `${s} (ordre probable)`));
		STAT.forEach((s, k) => add('Stats', `Copy ${k + 1}`, ['mCopyAp', k], `${s} (ordre probable)`));
		add('Stats', 'Offensive Magic', ['mOffnsMgc']);
		add('Stats', 'Defensive Magic', ['mDffnsMgc']);
		for (let k = 0; k < 4; k++) add('Equipment', `Slot ${k + 1} (ID)`, ['mEqList', k], '0 = vide');
		for (let k = 0; k < 12; k++) add('Field Magic', `Slot ${k + 1} (ID)`, ['mFieldMgc', k], '0 = vide');
		for (let k = 0; k < 12; k++) {
			add('Inventory', `Item ${k + 1} (ID)`, ['mBag', 'mItem', k, 'mMember.mItem'], '0 = vide');
			add('Inventory', `Item ${k + 1} · mCarry`, ['mBag', 'mItem', k, 'mMember.mCarry']);
		}
		for (let k = 0; k < 11; k++) {
			add('Jobs', `Job ${k + 1} · unlocked`, ['mJobRecord', k, 'mEnable'], '1 = oui');
			add('Jobs', `Job ${k + 1} · level`, ['mJobRecord', k, 'mJobLevel']);
			add('Jobs', `Job ${k + 1} · battles`, ['mJobRecord', k, 'mBattleCount']);
		}
		return rows;
	}

	function sectionName(path) {
		if (path[0] === 'SAVESLOTDATA' && path[1] === 'CSaveInfo' && path[2]) {
			const k = path[2];
			if (k === 'mPlayerInfo') return `Player ${path[3] + 1} · ${playerName(path[3]) || '(unnamed)'}`;
			if (k === 'mVillage') return 'Villages';
			if (k === 'mMonsterInfo') return 'Monsters';
			return `CSaveInfo · ${k}`;
		}
		return path.filter((x) => typeof x === 'string')[0] || 'Root';
	}

	/* ======================================================================
	 * 6. Modes
	 * ==================================================================== */
	const view = () => $('#dktView');
	const toolbar = () => $('#dktToolbar');

	/* ---------- Basic mode: table of all values ---------- */
	function renderBasic() {
		const rows = flatten(S.data).map((l, n) => {
			const label = pstr(l.path);
			return { id: n, label, section: sectionName(l.path), path: l.path, value: l.value };
		});
		const search = el('input', { class: 'dkInput', type: 'search', placeholder: 'Filter by path or value…' });
		const hideZero = el('input', { type: 'checkbox', checked: true });
		const count = el('span', { class: 'dkChip' });
		toolbar().replaceChildren(
			search,
			el('label', { class: 'dkCheck' }, hideZero, ' Hide 0 / false'),
			count,
		);
		const host = el('div', { class: 'dkTable' });
		view().replaceChildren(host);
		const t = buildTable(
			host,
			rows,
			[
				{ title: 'Chemin', field: 'label', headerSort: false, cssClass: 'cellPath', formatter: (c) => esc(c.getValue()) },
				valueColumn(),
			],
			{ groupBy: (d) => d.section, groupHeader, groupStartOpen: true },
		);
		if (!t) return;
		const apply = () => {
			const q = norm(search.value);
			t.setFilter((d) => {
				if (hideZero.checked && (d.value === 0 || d.value === false || d.value === '')) return false;
				return !q || norm(d.label).includes(q) || norm(d.value).includes(q);
			});
		};
		t.on('tableBuilt', apply);
		t.on('dataFiltered', (f, r) => (count.textContent = `${r.length} values`));
		search.addEventListener('input', apply);
		hideZero.addEventListener('change', apply);
	}

	/* ---------- Player focus mode ---------- */
	function renderPlayerChips() {
		const box = $('#dktChips');
		if (!box) return;
		box.replaceChildren(
			...players().map((p) =>
				el('button', {
					type: 'button',
					class: 'dkBtn dkBtn--small' + (p.i === S.focusIdx ? ' active' : ''),
					text: `${p.i + 1} · ${p.name}`,
					onclick: () => selectPlayer(p.i),
				}),
			),
		);
		const list = $('#dktPlayers');
		if (list) list.replaceChildren(...players().map((p) => el('option', { value: p.name })));
	}

	function selectPlayer(i) {
		S.focusIdx = i;
		const input = $('#dktFocusInput');
		if (input) input.value = playerName(i);
		renderPlayerChips();
		const host = $('#dktFocusTable');
		const rows = playerRows(i);
		buildTable(
			host,
			rows,
			[
				{ title: 'Field', field: 'name', headerSort: false, widthGrow: 2 },
				valueColumn({ width: 170 }),
				{ title: 'Info', field: 'hint', headerSort: false, cssClass: 'cellHint', widthGrow: 2, formatter: (c) => esc(c.getValue()) },
			],
			{ groupBy: 'group', groupHeader, groupStartOpen: (v) => ['Identity', 'Progression', 'Stats'].includes(v) },
		);
	}

	function renderFocus() {
		const input = el('input', {
			class: 'dkInput',
			id: 'dktFocusInput',
			type: 'text',
			list: 'dktPlayers',
			placeholder: 'Player nickname (autocomplete)…',
			autocomplete: 'off',
		});
		toolbar().replaceChildren(input, el('datalist', { id: 'dktPlayers' }), el('div', { class: 'dkChips', id: 'dktChips' }));
		view().replaceChildren(el('div', { class: 'dkTable', id: 'dktFocusTable' }, el('p', { class: 'dkEmpty', text: 'Select a player to display their data.' })));
		renderPlayerChips();
		input.addEventListener('input', () => {
			const q = norm(input.value);
			const exact = players().find((p) => norm(p.name) === q);
			if (q && exact && exact.i !== S.focusIdx) selectPlayer(exact.i);
		});
		input.addEventListener('change', () => {
			const q = norm(input.value);
			if (!q) return;
			const found = players().filter((p) => norm(p.name).includes(q));
			if (found.length === 1) selectPlayer(found[0].i);
			else if (found.length === 0) toast(`No player named “${input.value}” in this file.`, 'warn');
		});
		if (S.focusIdx != null && S.focusIdx < playerCount()) selectPlayer(S.focusIdx);
		else if (players().length === 1) selectPlayer(players()[0].i);
	}

	/* ---------- Default mode: simple form ---------- */
	function field(label, path, opts = {}) {
		const value = getPath(S.data, path);
		const input = el('input', {
			class: 'dkInput',
			type: typeof value === 'number' ? 'number' : 'text',
			value: value ?? '',
			step: typeof value === 'number' ? 1 : null,
			readonly: opts.readonly,
			title: opts.hint,
			'aria-label': label,
			dataset: { path: JSON.stringify(path), label: pstr(path) },
		});
		if (S.changes.has(pstr(path))) input.classList.add('is-modified');
		return el('div', { class: 'dkField' + (opts.wide ? ' wide' : '') }, el('label', { text: label }), input);
	}

	function renderDefault() {
		toolbar().replaceChildren(
			el('span', { class: 'dkHint', text: 'Essential values. For everything else, use Basic, Player Focus, or Advanced mode.' }),
		);
		const root = el('div', { class: 'dkForm' });
		const date = S.data['#DATE'];

		// --- Partie
		const week = [...CSAVE, 'mWeekInfo'];
		root.append(
			el(
				'section',
				{ class: 'dkCard' },
				el('h3', { text: 'Partie' }),
				el(
					'div',
					{ class: 'dkFields' },
					field('Semaine', [...week, 'mWeek']),
					field('Jour de la semaine', [...week, 'mWeekDay']),
					field('Number of players', [...CSAVE, 'mNumPlayer'], { readonly: true, hint: 'Cannot be changed here: changing this value would break the save.' }),
					field('Phase principale', [...CSAVE, 'mMainPhase'], { readonly: true }),
				),
				date ? el('p', { class: 'dkHint', text: `Saved on ${date}` }) : null,
			),
		);

		// --- Players
		const grid = el('div', { class: 'dkPlayers' });
		for (const p of players()) {
			const b = [...CSAVE, 'mPlayerInfo', p.i];
			grid.append(
				el(
					'section',
					{ class: 'dkCard' },
					el('h3', { text: `Player ${p.i + 1}` }),
					el(
						'div',
						{ class: 'dkFields' },
						field('Nickname', [...b, 'mName', 'mName_String'], { wide: true }),
						field('Gold', [...b, 'mGold']),
						field('Level', [...b, 'mLevel']),
						field('Experience', [...b, 'mExp']),
						field('Current HP', [...b, 'mParam', 'mHp']),
						field('Class (ID)', [...b, 'mClassID']),
					),
					el('h4', { text: 'Stat bonuses' }),
					el(
						'div',
						{ class: 'dkFields stats' },
						...STAT.map((s, k) => field(s, [...b, 'mAddAp', k], { hint: 'Ordre probable : ATK, DEF, MAG, SPD, PV' })),
					),
					el('h4', { text: 'Equipment (ID)' }),
					el('div', { class: 'dkFields stats4' }, ...[0, 1, 2, 3].map((k) => field(`Empl. ${k + 1}`, [...b, 'mEqList', k], { hint: '0 = vide' }))),
				),
			);
		}
		root.append(grid);
		root.addEventListener('change', (e) => {
			const t = e.target;
			if (!t.dataset || !t.dataset.path || t.readOnly) return;
			const path = JSON.parse(t.dataset.path);
			const cur = getPath(S.data, path);
			let v = t.value;
			if (typeof cur === 'number') {
				const n = Number(v);
				if (v.trim() === '' || !Number.isInteger(n)) {
					t.value = cur;
					return toast('An integer value is required.', 'warn');
				}
				v = n;
			}
			commit(path, v);
		});
		view().replaceChildren(root);

		// --- Villages
		const villages = getPath(S.data, [...CSAVE, 'mVillage']);
		if (Array.isArray(villages)) {
			const host = el('div', { class: 'dkTable' });
			view().append(el('h3', { class: 'dkSubTitle', text: 'Villages' }), host);
			const col = (title, f, extra = {}) => ({
				title,
				field: f,
				headerSort: false,
				editor: valueEditor,
				cssClass: 'cellValue',
				cellEdited: (cell) => {
					const d = cell.getRow().getData();
					commit([...CSAVE, 'mVillage', d.id, cell.getField()], cell.getValue());
					cell.getElement().classList.add('is-modified');
				},
				...extra,
			});
			buildTable(
				host,
				villages.map((v, id) => ({ id, ...v })),
				[
					{ title: '#', field: 'mVilID', width: 70, headerSort: true },
					col('Level', 'mLevel'),
					col('Owner', 'mOwner'),
					col('Total', 'mTotal'),
					col('Special', 'mSpecial'),
					col('Invest. min.', 'mMinCasInvest'),
				],
				{ height: '420px' },
			);
		}
	}

	/* ---------- Advanced mode: full JSON ---------- */
	function renderAdvanced() {
		const area = el('textarea', { class: 'dkCode', id: 'dktCode', spellcheck: 'false', wrap: 'off' });
		area.value = JSON.stringify(S.data, null, 2);
		const msg = el('span', { class: 'dkChip' });
		const search = el('input', { class: 'dkInput', type: 'search', placeholder: 'Search (Enter = next)…' });
		const info = () => (msg.textContent = `${area.value.split('\n').length} lignes · ${fmtBytes(new Blob([area.value]).size)}`);
		const apply = () => {
			try {
				S.data = JSON.parse(area.value);
			} catch (e) {
				toast('Invalid JSON: ' + e.message, 'err');
				return false;
			}
			refreshChanges();
			toast('JSON applied.', 'ok');
			area.dataset.dirty = '';
			return true;
		};
		area._apply = apply;
		toolbar().replaceChildren(
			search,
			el('button', { class: 'dkBtn dkBtn--small', type: 'button', text: 'Appliquer', onclick: apply }),
			el('button', {
				class: 'dkBtn dkBtn--small',
				type: 'button',
				text: 'Formater',
				onclick: () => {
					try {
						area.value = JSON.stringify(JSON.parse(area.value), null, 2);
						info();
					} catch (e) {
						toast('Invalid JSON: ' + e.message, 'err');
					}
				},
			}),
			el('button', {
				class: 'dkBtn dkBtn--small',
				type: 'button',
				text: 'Recharger',
				onclick: () => {
					area.value = JSON.stringify(S.data, null, 2);
					area.dataset.dirty = '';
					info();
				},
			}),
			msg,
		);
		area.addEventListener('input', () => {
			area.dataset.dirty = '1';
			info();
		});
		let from = 0;
		search.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter' || !search.value) return;
			let i = area.value.indexOf(search.value, from);
			if (i < 0) i = area.value.indexOf(search.value, 0);
			if (i < 0) return toast('No results.', 'warn');
			area.focus();
			area.setSelectionRange(i, i + search.value.length);
			const line = area.value.slice(0, i).split('\n').length - 1;
			area.scrollTop = Math.max(0, line * 19 - area.clientHeight / 2);
			from = i + 1;
			search.focus();
		});
		search.addEventListener('input', () => (from = 0));
		view().replaceChildren(area);
		info();
	}

	/* ---------- bascule des modes ---------- */
	const RENDER = { default: renderDefault, basic: renderBasic, focus: renderFocus, advanced: renderAdvanced };

	function setMode(mode) {
		const area = $('#dktCode');
		if (S.mode === 'advanced' && area && area.dataset.dirty && !area._apply()) return; // Invalid JSON: on reste
		destroyTable();
		S.mode = mode;
		$$('#dktTabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
		toolbar().replaceChildren();
		RENDER[mode]();
	}

	/* ======================================================================
	 * 7. Chargement / export
	 * ==================================================================== */
	async function parseFile(file) {
		const u8 = new Uint8Array(await file.arrayBuffer());
		if (isDat(u8)) return { kind: 'dat', text: await decodeSave(u8), bytes: u8 };
		const text = new TextDecoder('utf-8').decode(u8).replace(/^﻿/, '').replace(/\0+$/, '');
		try {
			JSON.parse(text);
		} catch (e) {
			throw new Error("Unrecognized file: neither a .dat save nor valid JSON (" + e.message + ').');
		}
		return { kind: 'json', text, bytes: null };
	}

	async function loadFile(file) {
		try {
			const r = await parseFile(file);
			S.data = JSON.parse(r.text);
			S.orig = JSON.parse(r.text);
			S.origFlat = new Map(flatten(S.orig).map((l) => [pstr(l.path), l.value]));
			S.origText = r.text;
			S.origBytes = r.bytes;
			S.kind = r.kind;
			S.name = file.name;
			S.size = file.size;
			S.focusIdx = null;
			S.changes.clear();
			showEditor();
			toast(`${file.name} loaded (${r.kind === 'dat' ? 'decoded from .dat' : 'JSON'}).`, 'ok');
		} catch (e) {
			toast(e.message, 'err');
		}
	}

	function showEditor() {
		const save = hasSave();
		$('#dktEditor').hidden = false;
		$$('#dktTabs button').forEach((b) => {
			const needs = b.dataset.mode === 'default' || b.dataset.mode === 'focus';
			b.disabled = needs && !save;
			b.title = b.disabled ? 'Unavailable: this file does not contain any players (mPlayerInfo).' : '';
		});
		const info = $('#dktInfo');
		info.hidden = false;
		info.replaceChildren(
			el('span', { class: 'dkChip is-strong', text: S.name }),
			el('span', { class: 'dkChip', text: S.kind === 'dat' ? '.dat' : '.json' }),
			el('span', { class: 'dkChip', text: fmtBytes(S.size) }),
			save ? el('span', { class: 'dkChip', text: `${players().length} player(s): ${players().map((p) => p.name).join(', ')}` }) : el('span', { class: 'dkChip', text: 'not a game save' }),
		);
		renderChanges();
		setMode(save ? 'default' : 'basic');
	}

	const modJson = () => JSON.stringify(S.data, null, 2);
	const need = () => {
		if (!S.data) toast('Load a file first.', 'warn');
		return !!S.data;
	};
	async function safe(fn) {
		try {
			await fn();
		} catch (e) {
			toast(e.message, 'err');
		}
	}
	const ACTIONS = {
		'orig-json': () => download(S.origText, baseName(S.name) + '.json', 'application/json'),
		'orig-dat': async () => download(S.origBytes || (await encodeSave(S.origText)), baseName(S.name) + '.dat', 'application/octet-stream'),
		'mod-json': () => {
			const area = $('#dktCode');
			if (S.mode === 'advanced' && area?.dataset.dirty && !area._apply()) return;
			download(modJson(), baseName(S.name) + '.json', 'application/json');
		},
		'mod-dat': async () => {
			const area = $('#dktCode');
			if (S.mode === 'advanced' && area?.dataset.dirty && !area._apply()) return;
			download(await encodeSave(modJson()), baseName(S.name) + '.dat', 'application/octet-stream');
			toast('Generated .dat file: replace your gameNN.dat file (keep a copy of the original).', 'ok');
		},
	};

	/* ======================================================================
	 * 8. Convertisseur autonome
	 * ==================================================================== */
	async function convert(file, dir, tile) {
		const out = $('.result', tile);
		try {
			const buf = new Uint8Array(await file.arrayBuffer());
			let blobData, name, mime;
			if (dir === 'dat2json') {
				if (!isDat(buf)) throw new Error('This file is not a .dat save file.');
				blobData = await decodeSave(buf);
				name = baseName(file.name) + '.json';
				mime = 'application/json';
			} else {
				if (isDat(buf)) throw new Error('This file is already a .dat file: use the .dat → .json converter.');
				const text = new TextDecoder().decode(buf).replace(/^﻿/, '').replace(/\0+$/, '');
				try {
					JSON.parse(text);
				} catch (e) {
					throw new Error('Invalid JSON: ' + e.message);
				}
				blobData = await encodeSave(text);
				name = baseName(file.name) + '.dat';
				mime = 'application/octet-stream';
			}
			const size = blobData.length ?? blobData.byteLength;
			download(blobData, name, mime);
			out.className = 'result is-ok';
			out.replaceChildren(
				`✔ ${name} (${fmtBytes(typeof blobData === 'string' ? new Blob([blobData]).size : size)}) `,
				el('button', { class: 'dkBtn dkBtn--small', type: 'button', text: 'Download again', onclick: () => download(blobData, name, mime) }),
			);
		} catch (e) {
			out.className = 'result is-err';
			out.textContent = '✖ ' + e.message;
		}
	}

	function bindDrop(zone, input, handler) {
		zone.addEventListener('dragover', (e) => {
			e.preventDefault();
			zone.classList.add('is-over');
		});
		zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
		zone.addEventListener('drop', (e) => {
			e.preventDefault();
			zone.classList.remove('is-over');
			if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]);
		});
		input.addEventListener('change', () => {
			if (input.files[0]) handler(input.files[0]);
			input.value = '';
		});
	}

	/* ======================================================================
	 * 9. Initialisation
	 * ==================================================================== */
	function init() {
		const root = $('#saveEditor');
		if (!root) return;

		bindDrop($('#dktDrop'), $('#dktFile'), loadFile);

		$$('#dktTabs button').forEach((b) => b.addEventListener('click', () => S.data && setMode(b.dataset.mode)));

		$$('[data-action]', root).forEach((b) => b.addEventListener('click', () => need() && safe(ACTIONS[b.dataset.action])));

		$('#dktResetAll').addEventListener('click', () => {
			if (!S.data || !confirm('Discard all changes and restore the loaded file?')) return;
			S.data = clone(S.orig);
			S.changes.clear();
			renderChanges();
			setMode(S.mode === 'advanced' ? 'advanced' : S.mode);
			toast('Changes discarded.', 'ok');
		});

		$$('.dkConvert', root).forEach((tile) => {
			const input = $('input[type=file]', tile);
			const zone = $('.dkDrop', tile);
			bindDrop(zone, input, (f) => convert(f, tile.dataset.dir, tile));
		});

		window.addEventListener('beforeunload', (e) => {
			if (S.changes.size) {
				e.preventDefault();
				e.returnValue = '';
			}
		});

		// Exposed for testing and console use
		window.DKT_SAVE = { decodeSave, encodeSave, state: S };
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
