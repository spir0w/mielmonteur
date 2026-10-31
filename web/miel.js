// De pagina: het spel kiezen, het in de browser bewaren (IndexedDB), en dan
// ScummVM starten met die bestanden. ScummVM zelf staat in scummvm.js/.wasm.
import { spelUitBestand, spelUitMap } from './importeren.js';

const $ = (id) => document.getElementById(id);

// Waar het spel in ScummVM's bestandssysteem komt, en hoe we hem starten
const SPEL_PAD = '/mielmonteur/spel';
const INI_PAD = '/mielmonteur/scummvm.ini';
const INI_SLEUTEL = 'mielmonteur-scummvm.ini';
const DOEL = {
	description: "Miel Monteur bouwt auto's",
	gameid: 'garygadget1',
	engineid: 'director',
	path: SPEL_PAD,
	language: 'nl',
	platform: 'windows',
};
const STANDAARD = {
	gui_language: 'nl_NL',
	enable_unsupported_game_warning: 'false',
	autosave_period: '30',
	confirm_exit: 'false',
	stretch_mode: 'fit',
	filtering: 'false',
};

// IndexedDB --------------------------------------------------------------------

function openDb() {
	return new Promise((ok, mis) => {
		const verzoek = indexedDB.open('mielmonteur', 1);
		verzoek.onupgradeneeded = () => {
			verzoek.result.createObjectStore('bestanden');
			verzoek.result.createObjectStore('info');
		};
		verzoek.onsuccess = () => ok(verzoek.result);
		verzoek.onerror = () => mis(verzoek.error);
	});
}

function afgerond(tx) {
	return new Promise((ok, mis) => {
		tx.oncomplete = () => ok();
		tx.onerror = tx.onabort = () => mis(tx.error || new Error('Bewaren in de browser lukte niet.'));
	});
}

async function leesInfo() {
	const db = await openDb();
	return new Promise((ok, mis) => {
		const verzoek = db.transaction('info').objectStore('info').get('spel');
		verzoek.onsuccess = () => ok(verzoek.result);
		verzoek.onerror = () => mis(verzoek.error);
	});
}

async function wisSpel() {
	const db = await openDb();
	const tx = db.transaction(['bestanden', 'info'], 'readwrite');
	tx.objectStore('bestanden').clear();
	tx.objectStore('info').clear();
	await afgerond(tx);
}

// Bewaart de bestanden van het spel, een paar tegelijk: een transactie mag
// niet op iets anders wachten, dus eerst lezen, dan bewaren.
async function bewaarSpel(bestanden, bron) {
	await wisSpel();
	const db = await openDb();
	const totaal = bestanden.reduce((som, b) => som + b.grootte, 0);
	let gedaan = 0;
	for (let i = 0; i < bestanden.length; i += 8) {
		const groep = bestanden.slice(i, i + 8);
		const inhoud = [];
		for (const b of groep)
			inhoud.push(await (await b.lees()).arrayBuffer());
		const tx = db.transaction('bestanden', 'readwrite');
		groep.forEach((b, j) => tx.objectStore('bestanden').put(inhoud[j], b.pad));
		await afgerond(tx);
		gedaan += groep.reduce((som, b) => som + b.grootte, 0);
		toonBezig(`Het spel wordt in de browser bewaard… ${mb(gedaan)} van ${mb(totaal)}`, totaal ? gedaan / totaal : 1);
	}
	const tx = db.transaction('info', 'readwrite');
	tx.objectStore('info').put({ bron, aantal: bestanden.length, grootte: totaal, datum: Date.now() }, 'spel');
	await afgerond(tx);
	// Vraag de browser het spel niet zelf op te ruimen als de schijf vol raakt
	try {
		await navigator.storage?.persist?.();
	} catch {
		// niet erg
	}
}

// De pagina ----------------------------------------------------------------------

function mb(bytes) {
	return `${Math.max(1, Math.round(bytes / 1048576)).toLocaleString('nl-NL')} MB`;
}

function toonBezig(tekst, deel) {
	$('geen-spel').hidden = true;
	$('wel-spel').hidden = true;
	$('bezig').hidden = false;
	$('bezig-tekst').textContent = tekst;
	const balk = $('bezig-balk');
	if (deel === undefined)
		balk.removeAttribute('value');
	else
		balk.value = deel;
}

function toonFout(tekst) {
	$('fout').textContent = tekst;
	$('fout').hidden = !tekst;
}

async function toonStaat() {
	const info = await leesInfo();
	$('bezig').hidden = true;
	$('geen-spel').hidden = !!info;
	$('wel-spel').hidden = !info;
	if (info) {
		$('spel-info').textContent = `Miel Monteur staat klaar in deze browser (${mb(info.grootte)}, ` +
			`${info.aantal.toLocaleString('nl-NL')} bestanden, uit “${info.bron}”).`;
		$('spelen').focus();
	}
}

async function importeer(zoek, bron) {
	toonFout('');
	toonBezig('Het spel wordt gezocht…');
	try {
		const spel = await zoek();
		await bewaarSpel(spel, bron);
	} catch (e) {
		console.error(e);
		toonFout(e && e.name === 'QuotaExceededError'
			? 'Er is niet genoeg ruimte in de browser om het spel te bewaren. Maak ruimte vrij op de schijf en probeer het opnieuw.'
			: (e && e.message) || String(e));
	}
	await toonStaat();
}

function kiesBestand(invoer) {
	invoer.addEventListener('change', () => {
		const bestand = invoer.files[0];
		invoer.value = '';
		if (bestand)
			importeer(() => spelUitBestand(bestand, bestand.name), bestand.name);
	});
}

function kiesMap(invoer) {
	invoer.addEventListener('change', () => {
		const bestanden = [...invoer.files].map((f) => ({ pad: f.webkitRelativePath || f.name, grootte: f.size, lees: async () => f }));
		invoer.value = '';
		if (!bestanden.length)
			return;
		const naam = bestanden[0].pad.split('/')[0];
		importeer(async () => spelUitMap(bestanden, naam), naam);
	});
}

// Een gesleepte map uitlezen (FileSystemEntry, zoals de browser hem geeft)
async function leesItem(item, voorvoegsel = '') {
	if (item.isFile) {
		const bestand = await new Promise((ok, mis) => item.file(ok, mis));
		return [{ pad: voorvoegsel + item.name, grootte: bestand.size, lees: async () => bestand }];
	}
	const lezer = item.createReader();
	const kinderen = [];
	for (;;) {
		const stuk = await new Promise((ok, mis) => lezer.readEntries(ok, mis));
		if (!stuk.length)
			break;
		kinderen.push(...stuk);
	}
	const uit = [];
	for (const kind of kinderen)
		uit.push(...await leesItem(kind, voorvoegsel + item.name + '/'));
	return uit;
}

function slepen() {
	const vak = $('sleepvak');
	document.addEventListener('dragover', (e) => {
		e.preventDefault();
		vak.classList.add('erboven');
	});
	document.addEventListener('dragleave', (e) => {
		if (!e.relatedTarget)
			vak.classList.remove('erboven');
	});
	document.addEventListener('drop', (e) => {
		e.preventDefault();
		vak.classList.remove('erboven');
		if (!$('bezig').hidden || !$('speelveld').hidden)
			return;
		// webkitGetAsEntry kan alleen nu, tijdens het loslaten
		const items = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
		if (items.length === 1 && items[0].isFile) {
			const bestand = e.dataTransfer.files[0];
			importeer(() => spelUitBestand(bestand, bestand.name), bestand.name);
		} else if (items.length) {
			const naam = items.length === 1 ? items[0].name : 'de gesleepte bestanden';
			importeer(async () => {
				const bestanden = [];
				for (const item of items)
					bestanden.push(...await leesItem(item));
				return spelUitMap(bestanden, naam);
			}, naam);
		}
	});
}

// ScummVM's instellingen ----------------------------------------------------------
// ScummVM schrijft ze in zijn eigen bestandssysteem (in het geheugen); wij
// bewaren ze in localStorage, zodat bijvoorbeeld het volume blijft staan.

function leesIni(tekst) {
	const secties = new Map();
	let sectie = null;
	for (const regel of tekst.split(/\r?\n/)) {
		const kop = regel.match(/^\s*\[([^\]]+)\]\s*$/);
		if (kop) {
			sectie = kop[1];
			if (!secties.has(sectie))
				secties.set(sectie, new Map());
		} else if (sectie && /^\s*[^#;=\s][^=]*=/.test(regel)) {
			const i = regel.indexOf('=');
			secties.get(sectie).set(regel.slice(0, i).trim(), regel.slice(i + 1).trim());
		}
	}
	return secties;
}

function maakIni() {
	let opgeslagen = '';
	try {
		opgeslagen = localStorage.getItem(INI_SLEUTEL) || '';
	} catch {
		// localStorage uit: dan de standaard
	}
	const secties = leesIni(opgeslagen);
	const scummvm = new Map(Object.entries(STANDAARD));
	for (const [k, v] of secties.get('scummvm') || [])
		scummvm.set(k, v);
	const doel = secties.get('mielmonteur') || new Map();
	for (const [k, v] of Object.entries(DOEL))
		doel.set(k, v);
	secties.delete('scummvm');
	secties.delete('mielmonteur');
	const alle = [['scummvm', scummvm], ['mielmonteur', doel], ...secties];
	return alle.map(([naam, waarden]) => `[${naam}]\n` + [...waarden].map(([k, v]) => `${k}=${v}`).join('\n')).join('\n\n') + '\n';
}

function bewaarIni() {
	try {
		localStorage.setItem(INI_SLEUTEL, globalThis.FS.readFile(INI_PAD, { encoding: 'utf8' }));
	} catch {
		// ScummVM nog niet zo ver, of geen localStorage
	}
}

// Spelen ---------------------------------------------------------------------------

// ScummVM vraagt zijn eigen bestanden op als /data/...; dat moet ten opzichte
// van deze pagina zijn, ook als die in een submap staat (GitHub Pages).
function fetchNaarDezeMap() {
	const echt = window.fetch.bind(window);
	window.fetch = (invoer, opties) => {
		if (typeof invoer === 'string' && (invoer === '/data' || invoer.startsWith('/data/')))
			invoer = new URL('.' + invoer, document.baseURI).href;
		return echt(invoer, opties);
	};
}

// Zet de bewaarde bestanden in ScummVM's bestandssysteem, één voor één (zo
// staat het spel niet twee keer in het geheugen).
async function zetSpelKlaar(FS) {
	const db = await openDb();
	FS.mkdirTree(SPEL_PAD);
	await new Promise((ok, mis) => {
		const tx = db.transaction('bestanden');
		const verzoek = tx.objectStore('bestanden').openCursor();
		verzoek.onsuccess = () => {
			const c = verzoek.result;
			if (!c)
				return;
			const pad = `${SPEL_PAD}/${c.key}`;
			FS.mkdirTree(pad.slice(0, pad.lastIndexOf('/')));
			FS.writeFile(pad, new Uint8Array(c.value), { canOwn: true });
			c.continue();
		};
		tx.oncomplete = () => ok();
		tx.onerror = () => mis(tx.error);
	});
	FS.writeFile(INI_PAD, maakIni());
}

function laadStatus(tekst) {
	$('laadstatus').textContent = tekst;
	$('laadstatus').hidden = !tekst;
}

function spelen() {
	document.body.classList.add('spelen');
	$('welkom').hidden = true;
	$('speelveld').hidden = false;
	laadStatus('ScummVM wordt geladen…');
	fetchNaarDezeMap();

	const canvas = $('canvas');
	canvas.addEventListener('webglcontextlost', (e) => {
		e.preventDefault();
		laadStatus('De grafische kaart liet het spel los. Laad de pagina opnieuw.');
	});
	window.addEventListener('error', () => laadStatus('Er ging iets mis. Laad de pagina opnieuw (opgeslagen spellen blijven bewaard).'));

	let wachten = 0;
	window.Module = {
		canvas,
		print: (t) => console.log(t),
		printErr: (t) => console.warn(t),
		setStatus: (t) => {
			if (!wachten)
				laadStatus(t ? 'ScummVM wordt geladen…' : '');
		},
		monitorRunDependencies: (over) => {
			wachten = over;
			laadStatus(over ? 'Het spel wordt klaargezet…' : '');
		},
		preRun: [() => {
			const FS = globalThis.FS || window.Module.FS;
			const erbij = globalThis.addRunDependency || window.Module.addRunDependency;
			const klaar = globalThis.removeRunDependency || window.Module.removeRunDependency;
			erbij('mielmonteur');
			zetSpelKlaar(FS).then(() => klaar('mielmonteur'), (e) => {
				console.error(e);
				laadStatus(`Het spel kon niet klaargezet worden: ${e.message || e}`);
			});
		}],
		// Stoppen in het spel: terug naar het begin
		onExit: () => location.reload(),
	};
	// ScummVM leest zijn opties uit het deel na # (dists/emscripten/custom_shell-pre.js)
	history.replaceState(null, '', `${location.pathname}${location.search}#--config=${INI_PAD} mielmonteur`);
	setInterval(bewaarIni, 30000);
	document.addEventListener('visibilitychange', bewaarIni);
	window.addEventListener('pagehide', bewaarIni);

	const script = document.createElement('script');
	script.src = 'scummvm.js';
	script.onerror = () => laadStatus('ScummVM kon niet geladen worden (scummvm.js ontbreekt).');
	document.body.append(script);
	canvas.focus();
}

// Begin ------------------------------------------------------------------------------

async function begin() {
	if (location.hash)
		history.replaceState(null, '', `${location.pathname}${location.search}`);
	if (!window.indexedDB) {
		toonFout('Deze browser kan het spel niet bewaren. Probeer Edge, Chrome of Firefox.');
		return;
	}
	kiesBestand($('kies-bestand'));
	kiesBestand($('kies-ander'));
	kiesMap($('kies-map'));
	kiesMap($('kies-andere-map'));
	slepen();
	$('spelen').addEventListener('click', spelen);
	$('wissen').addEventListener('click', async () => {
		if (!confirm('Het spel uit deze browser wissen? Opgeslagen spellen blijven bewaard.'))
			return;
		await wisSpel();
		await toonStaat();
	});
	try {
		await toonStaat();
	} catch (e) {
		toonFout(`De browser gaf een fout bij het openen van de opslag: ${e.message || e}`);
		$('geen-spel').hidden = false;
	}
}

begin();
