// Haalt Miel Monteur uit wat de speler kiest: een ISO van de cd (ook BIN/raw),
// een ZIP (ook een ZIP met een ISO erin) of een map. Alles gebeurt in de
// browser; er wordt niets geüpload. Werkt ook in Node (voor de tests).

// Bestanden die elke uitgave van het autospel heeft, in welke taal ook (de
// herkenning in onze ScummVM en de Windows-starter kijken naar dezelfde).
export const KENMERKEN = ['00.CXT', 'CDDATA.CXT', '03.DXR', '05.DXR', '94.DXR'];

// Mappen met installatieprogramma's die het spel zelf niet nodig heeft.
const OVERSLAAN = /^(directx|quicktime|qtw?\d*|qtinst\w*|acrobat|acroread)$/i;

// Een naam zoals hij op de cd staat: zonder ";1" en de punt aan het eind van
// ISO 9660-namen, in hoofdletters.
export function kaleNaam(naam) {
	const i = naam.lastIndexOf(';');
	if (i >= 0)
		naam = naam.slice(0, i);
	return naam.replace(/\.+$/, '').toUpperCase();
}

// Een pad met de namen zoals ScummVM ze moet zien (zonder ;1 en eindpunt,
// maar wel in de hoofd-/kleine letters van de cd).
export function schoonPad(pad) {
	return pad.split('/').filter(Boolean).map((deel) => {
		const i = deel.lastIndexOf(';');
		if (i >= 0)
			deel = deel.slice(0, i);
		return deel.replace(/\.+$/, '');
	}).join('/');
}

// De map van het spel in een lijst paden ("cd/MOVIES/00.CXT", ...): de map
// met DATA/ en MOVIES/ (de cd zelf), als voorvoegsel met "/" erachter ("" als
// het spel in de wortel staat). null als het autospel er niet tussen staat.
export function vindSpelWortel(paden) {
	const perMap = new Map();
	for (const pad of paden) {
		const delen = schoonPad(pad).split('/');
		const naam = kaleNaam(delen.pop());
		const map = delen.join('/');
		if (!perMap.has(map))
			perMap.set(map, new Set());
		perMap.get(map).add(naam);
	}
	const kandidaten = [...perMap.keys()].filter((map) => KENMERKEN.every((k) => perMap.get(map).has(k)));
	if (!kandidaten.length)
		return null;
	// De minst diepe
	kandidaten.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
	const films = kandidaten[0];
	const delen = films ? films.split('/') : [];
	const blad = delen.length ? delen[delen.length - 1] : '';
	const ouder = delen.slice(0, -1).join('/');
	const ouderHeeftData = [...perMap.keys()].some((map) => {
		const d = map.split('/');
		return d.length === delen.length && d.slice(0, -1).join('/') === ouder && kaleNaam(d[d.length - 1]) === 'DATA';
	});
	const wortel = delen.length && (kaleNaam(blad) === 'MOVIES' || ouderHeeftData) ? ouder : films;
	return wortel ? wortel + '/' : '';
}

// De bestanden van het spel uit een lijst {pad, grootte, lees}: alleen wat
// onder de spelwortel staat, met paden ten opzichte daarvan.
export function kiesSpelBestanden(bestanden) {
	const wortel = vindSpelWortel(bestanden.map((b) => b.pad));
	if (wortel === null)
		return null;
	const gekozen = [];
	for (const b of bestanden) {
		const pad = schoonPad(b.pad);
		if (!pad.startsWith(wortel))
			continue;
		const rel = pad.slice(wortel.length);
		const mappen = rel.split('/').slice(0, -1);
		if (mappen.some((m) => OVERSLAAN.test(m)))
			continue;
		if (/\.(cab|msi)$/i.test(rel))
			continue;
		gekozen.push({ ...b, pad: rel });
	}
	return gekozen;
}

// Lezen ----------------------------------------------------------------------

// Een bron die we in stukken lezen: een Blob/File (browser, Node 20+), of
// een Uint8Array.
function lezer(bron) {
	if (bron instanceof Uint8Array) {
		return {
			grootte: bron.length,
			lees: async (van, lengte) => bron.subarray(van, Math.min(van + lengte, bron.length)),
			blob: (van, tot) => new Blob([bron.subarray(van, tot)]),
		};
	}
	return {
		grootte: bron.size,
		lees: async (van, lengte) => new Uint8Array(await bron.slice(van, van + lengte).arrayBuffer()),
		blob: (van, tot) => bron.slice(van, tot),
	};
}

const tekst = new TextDecoder('latin1');
function ascii(bytes, van, lengte) {
	return tekst.decode(bytes.subarray(van, van + lengte));
}

// ISO 9660 ---------------------------------------------------------------------

// Waar de 2048 bytes gebruikersdata van een sector staan: gewone ISO's,
// en ruwe images (BIN, MDF, IMG) met 2352 of 2336 bytes per sector.
const SECTORVORMEN = [
	{ sector: 2048, kop: 0 },
	{ sector: 2352, kop: 16 },	// mode 1
	{ sector: 2352, kop: 24 },	// mode 2, XA form 1
	{ sector: 2336, kop: 8 },
];

export async function isIso(bron) {
	return (await isoVorm(lezer(bron))) !== null;
}

async function isoVorm(l) {
	for (const vorm of SECTORVORMEN) {
		const pos = 16 * vorm.sector + vorm.kop;
		if (pos + 6 > l.grootte)
			continue;
		const b = await l.lees(pos, 6);
		if (ascii(b, 1, 5) === 'CD001')
			return vorm;
	}
	return null;
}

// Alle bestanden van een ISO: [{pad, grootte, lees: async () => Blob}].
// Joliet (lange namen) als de cd die heeft, anders gewone ISO 9660-namen.
export async function leesIso(bron) {
	const l = lezer(bron);
	const vorm = await isoVorm(l);
	if (!vorm)
		throw new Error('Dit is geen ISO-bestand van een cd.');

	// Sectoren lezen, ook uit ruwe images (waar elke sector een kop heeft)
	const leesSectoren = async (lba, aantalBytes) => {
		if (vorm.sector === 2048)
			return l.lees(lba * 2048, aantalBytes);
		const uit = new Uint8Array(aantalBytes);
		const n = Math.ceil(aantalBytes / 2048);
		const ruw = await l.lees(lba * vorm.sector, n * vorm.sector);
		for (let i = 0; i < n; i++) {
			const stuk = ruw.subarray(i * vorm.sector + vorm.kop, i * vorm.sector + vorm.kop + 2048);
			uit.set(stuk.subarray(0, Math.min(2048, aantalBytes - i * 2048)), i * 2048);
		}
		return uit;
	};
	const bestandBlob = async (lba, grootte) => {
		if (vorm.sector === 2048)
			return l.blob(lba * 2048, lba * 2048 + grootte);
		const delen = [];
		const stap = 512 * 2048;	// 1 MB per keer
		for (let gedaan = 0; gedaan < grootte; gedaan += stap)
			delen.push(await leesSectoren(lba + gedaan / 2048, Math.min(stap, grootte - gedaan)));
		return new Blob(delen);
	};

	// De beschrijvingen van het volume: de primaire en eventueel Joliet
	let primair = null, joliet = null;
	for (let s = 16; s < 64; s++) {
		const vd = await leesSectoren(s, 2048);
		if (ascii(vd, 1, 5) !== 'CD001')
			break;
		const soort = vd[0];
		if (soort === 1 && !primair)
			primair = vd;
		if (soort === 2) {
			const esc = ascii(vd, 88, 3);
			if (esc === '%/@' || esc === '%/C' || esc === '%/E')
				joliet = vd;
		}
		if (soort === 255)
			break;
	}
	const vd = joliet || primair;
	if (!vd)
		throw new Error('Deze ISO heeft geen ISO 9660-bestandssysteem.');
	const ucs2 = new TextDecoder('utf-16be');
	const naamVan = (b, van, lengte) => joliet ? ucs2.decode(b.subarray(van, van + lengte)) : ascii(b, van, lengte);

	const bestanden = [];
	const gezien = new Set();
	const leesMap = async (lba, grootte, voorvoegsel, diepte) => {
		if (diepte > 16 || gezien.has(lba))
			return;
		gezien.add(lba);
		const data = await leesSectoren(lba, grootte);
		let pos = 0;
		while (pos < data.length) {
			const lengte = data[pos];
			if (lengte === 0) {
				// Records gaan niet over een sectorgrens: naar de volgende sector
				pos = (Math.floor(pos / 2048) + 1) * 2048;
				continue;
			}
			const extent = u32(data, pos + 2);
			const omvang = u32(data, pos + 10);
			const vlaggen = data[pos + 25];
			const naamLengte = data[pos + 32];
			const isZelfOfOuder = naamLengte === 1 && (data[pos + 33] === 0 || data[pos + 33] === 1);
			if (!isZelfOfOuder) {
				const pad = voorvoegsel + naamVan(data, pos + 33, naamLengte);
				if (vlaggen & 2)
					await leesMap(extent, omvang, pad + '/', diepte + 1);
				else if (!(vlaggen & 4))	// geen "associated file" (een Mac-resourcefork)
					bestanden.push({ pad, grootte: omvang, lees: () => bestandBlob(extent, omvang) });
			}
			pos += lengte;
		}
	};
	// Het record van de hoofdmap staat op plek 156 van de beschrijving
	await leesMap(u32(vd, 156 + 2), u32(vd, 156 + 10), '', 0);
	return bestanden;
}

// ZIP --------------------------------------------------------------------------

function u16(b, i) { return b[i] | b[i + 1] << 8; }
function u32(b, i) { return (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0; }
function u64(b, i) { return u32(b, i) + u32(b, i + 4) * 0x100000000; }

export async function isZip(bron) {
	const l = lezer(bron);
	if (l.grootte < 4)
		return false;
	const b = await l.lees(0, 4);
	return u32(b, 0) === 0x04034b50 || u32(b, 0) === 0x06054b50;
}

// Alle bestanden van een ZIP: [{pad, grootte, lees: async () => Blob}].
export async function leesZip(bron) {
	const l = lezer(bron);
	const staartLengte = Math.min(l.grootte, 65536 + 22);
	const staart = await l.lees(l.grootte - staartLengte, staartLengte);
	let eocd = -1;
	for (let i = staart.length - 22; i >= 0; i--) {
		if (u32(staart, i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0)
		throw new Error('Dit ZIP-bestand is beschadigd of onvolledig.');
	let aantal = u16(staart, eocd + 10);
	let cdGrootte = u32(staart, eocd + 12);
	let cdBegin = u32(staart, eocd + 16);
	if (cdBegin === 0xffffffff || aantal === 0xffff) {
		// ZIP64
		const locator = eocd - 20;
		if (locator < 0 || u32(staart, locator) !== 0x07064b50)
			throw new Error('Dit ZIP-bestand wordt niet ondersteund.');
		const eocd64Pos = u64(staart, locator + 8);
		const e = await l.lees(eocd64Pos, 56);
		aantal = u64(e, 32);
		cdGrootte = u64(e, 40);
		cdBegin = u64(e, 48);
	}
	const cd = await l.lees(cdBegin, cdGrootte);
	const utf8 = new TextDecoder('utf-8');
	const bestanden = [];
	let pos = 0;
	for (let n = 0; n < aantal && pos + 46 <= cd.length; n++) {
		if (u32(cd, pos) !== 0x02014b50)
			break;
		const vlaggen = u16(cd, pos + 8);
		const methode = u16(cd, pos + 10);
		let gepakt = u32(cd, pos + 20);
		let grootte = u32(cd, pos + 24);
		const naamLengte = u16(cd, pos + 28), extraLengte = u16(cd, pos + 30), commentaar = u16(cd, pos + 32);
		let kop = u32(cd, pos + 42);
		const naamBytes = cd.subarray(pos + 46, pos + 46 + naamLengte);
		const naam = (vlaggen & 0x800 ? utf8 : tekst).decode(naamBytes).replace(/\\/g, '/');
		// ZIP64-groottes in het extra veld 0x0001
		let x = pos + 46 + naamLengte;
		const xEind = x + extraLengte;
		while (x + 4 <= xEind) {
			const id = u16(cd, x), len = u16(cd, x + 2);
			if (id === 1) {
				let p = x + 4;
				if (grootte === 0xffffffff) { grootte = u64(cd, p); p += 8; }
				if (gepakt === 0xffffffff) { gepakt = u64(cd, p); p += 8; }
				if (kop === 0xffffffff) { kop = u64(cd, p); p += 8; }
			}
			x += 4 + len;
		}
		pos = xEind + commentaar;
		if (naam.endsWith('/'))
			continue;
		const lees = async () => {
			if (vlaggen & 1)
				throw new Error(`${naam} is versleuteld; pak de ZIP eerst zelf uit.`);
			const lokaal = await l.lees(kop, 30);
			if (u32(lokaal, 0) !== 0x04034b50)
				throw new Error(`${naam}: beschadigd ZIP-bestand.`);
			const begin = kop + 30 + u16(lokaal, 26) + u16(lokaal, 28);
			const gegevens = l.blob(begin, begin + gepakt);
			if (methode === 0)
				return gegevens;
			if (methode === 8) {
				const stroom = gegevens.stream().pipeThrough(new DecompressionStream('deflate-raw'));
				return new Blob([await new Response(stroom).arrayBuffer()]);
			}
			throw new Error(`${naam} is ingepakt op een manier die we niet kennen (methode ${methode}); pak de ZIP eerst zelf uit.`);
		};
		bestanden.push({ pad: naam, grootte, lees });
	}
	return bestanden;
}

// Alles bij elkaar -------------------------------------------------------------------

// Zoekt het spel in één gekozen bestand (ISO of ZIP, ook een ZIP met een
// ISO erin). Geeft de bestanden van het spel, of gooit een fout met uitleg.
export async function spelUitBestand(bestand, naam = bestand.name || '') {
	if (await isIso(bestand))
		return gevonden(await leesIso(bestand), naam);
	if (await isZip(bestand)) {
		const inhoud = await leesZip(bestand);
		const spel = kiesSpelBestanden(inhoud);
		if (spel)
			return spel;
		const iso = inhoud.find((b) => /\.(iso|bin|img|mdf)$/i.test(b.pad));
		if (iso)
			return gevonden(await leesIso(await iso.lees()), iso.pad);
		return gevonden(inhoud, naam);
	}
	if (/\.(7z|rar)$/i.test(naam))
		throw new Error(`${naam} is een 7z- of RAR-bestand. Pak het eerst uit (bijvoorbeeld met 7-Zip) en kies dan de ISO of de map.`);
	throw new Error(`${naam} is geen ISO- of ZIP-bestand.`);
}

// Zoekt het spel in een gekozen map: [{pad, grootte, lees}] met paden zoals
// webkitRelativePath ("Miel/MOVIES/00.CXT").
export function spelUitMap(bestanden, naam = 'deze map') {
	return gevonden(bestanden, naam);
}

function gevonden(bestanden, naam) {
	const spel = kiesSpelBestanden(bestanden);
	if (!spel)
		throw new Error(`In ${naam} staat geen Miel Monteur bouwt auto's. Daarvoor moeten onder andere ${KENMERKEN.join(', ')} in één map staan (op de cd is dat de map MOVIES).`);
	return spel;
}
