// Tests voor web/importeren.js: node --test tests/importeren.test.mjs
// De ISO's maakt xorriso, de ZIP's zip; zonder die programma's worden die
// tests overgeslagen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, openAsBlob } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import {
	kaleNaam, schoonPad, vindSpelWortel, kiesSpelBestanden,
	isIso, isZip, leesIso, leesZip, spelUitBestand, spelUitMap,
} from '../web/importeren.js';

function heeft(programma) {
	try {
		execFileSync('sh', ['-c', `command -v ${programma}`], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

// Een nep-cd: de bestandsnamen van het autospel, met inhoud die we kunnen
// terugcontroleren (en een groot bestand over meerdere sectoren).
function maakNepCd(map) {
	const inhoud = {};
	const zet = (pad, data) => {
		mkdirSync(join(map, ...pad.split('/').slice(0, -1)), { recursive: true });
		writeFileSync(join(map, ...pad.split('/')), data);
		inhoud[pad] = data;
	};
	zet('DATA/MIEL32.EXE', Buffer.from('MZ nep-projector'));
	zet('DATA/DATA.CST', Buffer.alloc(5000, 7));
	for (const naam of ['00.CXT', 'CDDATA.CXT', '03.DXR', '05.DXR', '94.DXR', '10.DXR'])
		zet(`MOVIES/${naam}`, Buffer.from(`film ${naam}`));
	const groot = Buffer.alloc(3 * 1024 * 1024 + 123);
	for (let i = 0; i < groot.length; i++)
		groot[i] = (i * 31 + (i >> 11)) & 255;
	zet('MOVIES/02.DXR', groot);
	zet('XTRAS/FILEIO.X32', Buffer.from('xtra'));
	zet('DIRECTX/DXSETUP.EXE', Buffer.from('niet nodig'));
	zet('SETUP.EXE', Buffer.from('installatie'));
	return inhoud;
}

function sha(data) {
	return createHash('sha256').update(data).digest('hex');
}

async function controleer(spel, inhoud) {
	const paden = spel.map((b) => b.pad).sort();
	assert.ok(paden.includes('MOVIES/CDDATA.CXT'), 'MOVIES/CDDATA.CXT erbij');
	assert.ok(paden.includes('DATA/MIEL32.EXE'), 'DATA/MIEL32.EXE erbij');
	assert.ok(!paden.some((p) => p.startsWith('DIRECTX/')), 'DirectX overgeslagen');
	for (const b of spel) {
		const verwacht = inhoud[b.pad.toUpperCase()] || inhoud[b.pad];
		assert.ok(verwacht, `onbekend bestand ${b.pad}`);
		const data = new Uint8Array(await (await b.lees()).arrayBuffer());
		assert.equal(data.length, verwacht.length, `grootte van ${b.pad}`);
		assert.equal(b.grootte, verwacht.length, `opgegeven grootte van ${b.pad}`);
		assert.equal(sha(data), sha(verwacht), `inhoud van ${b.pad}`);
	}
}

// Een ISO met 2048 bytes per sector omzetten naar een ruwe mode 1-image
// (2352 bytes: synchronisatie, kop, data, en lege foutcorrectie).
function naarRuw(iso) {
	const n = iso.length / 2048;
	const ruw = Buffer.alloc(n * 2352);
	for (let i = 0; i < n; i++) {
		const s = i * 2352;
		ruw.fill(0xff, s + 1, s + 11);
		ruw[s + 15] = 1;
		iso.copy(ruw, s + 16, i * 2048, (i + 1) * 2048);
	}
	return ruw;
}

test('namen zoals op de cd', () => {
	assert.equal(kaleNaam('cddata.cxt;1'), 'CDDATA.CXT');
	assert.equal(kaleNaam('03.DXR.'), '03.DXR');
	assert.equal(schoonPad('/CD/MOVIES/00.CXT;1'), 'CD/MOVIES/00.CXT');
});

test('de spelwortel vinden', () => {
	const films = ['00.CXT', 'CDDATA.CXT', '03.DXR', '05.DXR', '94.DXR'];
	const met = (voor) => films.map((f) => voor + f);
	assert.equal(vindSpelWortel([...met('MOVIES/'), 'DATA/MULLE32.EXE']), '');
	assert.equal(vindSpelWortel([...met('Miel/MOVIES/'), 'Miel/DATA/X.EXE']), 'Miel/');
	assert.equal(vindSpelWortel(met('movies/').map((p) => p.toLowerCase() + ';1')), '');
	assert.equal(vindSpelWortel(met('Spel/')), 'Spel/', 'alles in een map');
	assert.equal(vindSpelWortel([...met('x/Films/'), 'x/DATA/A.EXE']), 'x/', 'films naast DATA');
	assert.equal(vindSpelWortel(films.slice(0, 4).map((f) => 'MOVIES/' + f)), null, 'zonder 94.DXR geen autospel');
	const gekozen = kiesSpelBestanden([...met('cd/MOVIES/'), 'cd/DATA/A.EXE', 'cd/QUICKTIME/QT.EXE', 'cd/x.cab', 'ander/b.txt']
		.map((pad) => ({ pad, grootte: 1 })));
	assert.deepEqual(gekozen.map((b) => b.pad).sort(), [...met('MOVIES/'), 'DATA/A.EXE'].sort());
});

const metXorriso = heeft('xorriso') ? test : test.skip;
const metZip = heeft('zip') ? test : test.skip;

let werk;
function werkmap() {
	werk ??= mkdtempSync(join(tmpdir(), 'miel-import-'));
	return werk;
}
process.on('exit', () => werk && rmSync(werk, { recursive: true, force: true }));

metXorriso('ISO met Joliet, zonder Joliet, en ruw (BIN)', async () => {
	const cd = join(werkmap(), 'cd-iso');
	const inhoud = maakNepCd(cd);
	for (const joliet of [true, false]) {
		const iso = join(werkmap(), joliet ? 'joliet.iso' : 'kaal.iso');
		execFileSync('xorriso', ['-as', 'mkisofs', '-quiet', ...(joliet ? ['-J'] : []), '-V', 'MIEL', '-o', iso, cd], { stdio: 'ignore' });
		const blob = await openAsBlob(iso);
		assert.ok(await isIso(blob));
		assert.ok(!(await isZip(blob)));
		const alles = await leesIso(blob);
		assert.ok(alles.length >= 10, `${alles.length} bestanden`);
		await controleer(await spelUitBestand(blob, 'test.iso'), inhoud);
	}
	const ruw = naarRuw(readFileSync(join(werkmap(), 'joliet.iso')));
	const bin = join(werkmap(), 'ruw.bin');
	writeFileSync(bin, ruw);
	await controleer(await spelUitBestand(await openAsBlob(bin), 'ruw.bin'), inhoud);
	// Ook uit het geheugen (een ISO die uit een ZIP komt)
	await controleer(await spelUitBestand(new Uint8Array(readFileSync(join(werkmap(), 'kaal.iso'))), 'x.iso'), inhoud);
});

metZip('ZIP (ingepakt en opgeslagen), en een ZIP met een ISO erin', async () => {
	const ouder = join(werkmap(), 'zip-bron');
	const inhoud = maakNepCd(join(ouder, 'Miel Monteur'));
	for (const niveau of ['-6', '-0']) {
		const zip = join(werkmap(), `spel${niveau}.zip`);
		execFileSync('zip', ['-q', '-r', niveau, zip, 'Miel Monteur'], { cwd: ouder });
		const blob = await openAsBlob(zip);
		assert.ok(await isZip(blob));
		assert.ok(!(await isIso(blob)));
		assert.ok((await leesZip(blob)).length >= 10);
		await controleer(await spelUitBestand(blob, 'spel.zip'), inhoud);
	}
	if (heeft('xorriso')) {
		const iso = join(werkmap(), 'inzip.iso');
		execFileSync('xorriso', ['-as', 'mkisofs', '-quiet', '-J', '-o', iso, join(ouder, 'Miel Monteur')], { stdio: 'ignore' });
		const zip = join(werkmap(), 'iso-in-zip.zip');
		execFileSync('zip', ['-q', '-j', zip, iso]);
		await controleer(await spelUitBestand(await openAsBlob(zip), 'iso-in-zip.zip'), inhoud);
	}
});

test('een map (zoals de browser hem geeft)', async () => {
	const cd = join(werkmap(), 'map', 'MielCD');
	const inhoud = maakNepCd(cd);
	const bestanden = Object.keys(inhoud).map((pad) => ({
		pad: 'MielCD/' + pad,
		grootte: inhoud[pad].length,
		lees: async () => new Blob([inhoud[pad]]),
	}));
	await controleer(spelUitMap(bestanden, 'MielCD'), inhoud);
	assert.throws(() => spelUitMap(bestanden.filter((b) => !b.pad.endsWith('94.DXR')), 'x'), /geen Miel Monteur/);
});

test('geen ISO of ZIP', async () => {
	await assert.rejects(spelUitBestand(new Blob(['hallo']), 'iets.txt'), /geen ISO- of ZIP-bestand/);
	await assert.rejects(spelUitBestand(new Blob(['hallo']), 'spel.7z'), /7z- of RAR-bestand/);
});
