// Test van de webpagina in een echte browser (Chromium via Playwright), met
// een nagebootste scummvm.js: spel kiezen (ISO en map), bewaren, opnieuw
// laden, en wat er bij "Spelen" voor ScummVM klaarstaat.
//   node --test tests/webpagina.test.mjs
// Zonder Playwright of xorriso wordt de test overgeslagen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let playwright = null;
try {
	playwright = require('playwright');
} catch {
	// niet aanwezig
}
let xorriso = true;
try {
	execFileSync('sh', ['-c', 'command -v xorriso'], { stdio: 'ignore' });
} catch {
	xorriso = false;
}

const soorten = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf' };

(playwright && xorriso ? test : test.skip)('webpagina: kiezen, bewaren, spelen', async () => {
	const werk = mkdtempSync(join(tmpdir(), 'miel-web-'));
	try {
		// De site: onze pagina met de nagebootste ScummVM
		const site = join(werk, 'site');
		mkdirSync(join(site, 'data'), { recursive: true });
		for (const f of ['index.html', 'miel.css', 'miel.js', 'importeren.js', 'bediening.js'])
			copyFileSync(join(hier, '..', 'web', f), join(site, f));
		copyFileSync(join(hier, 'hulp', 'scummvm-nep.js'), join(site, 'scummvm.js'));
		writeFileSync(join(site, 'data', 'index.json'), '{}');

		// Een nep-cd als ISO, en als map
		const cd = join(werk, 'MIELCD');
		mkdirSync(join(cd, 'DATA'), { recursive: true });
		mkdirSync(join(cd, 'MOVIES'), { recursive: true });
		writeFileSync(join(cd, 'DATA', 'MIEL32.EXE'), 'MZ');
		for (const f of ['00.CXT', 'CDDATA.CXT', '03.DXR', '05.DXR', '94.DXR', '10.DXR'])
			writeFileSync(join(cd, 'MOVIES', f), `film ${f}`);
		const iso = join(werk, 'Miel Monteur.iso');
		execFileSync('xorriso', ['-as', 'mkisofs', '-quiet', '-J', '-o', iso, cd], { stdio: 'ignore' });

		// Een eenvoudige server, die ook bijhoudt wat er gevraagd wordt
		const gevraagd = [];
		const server = createServer((req, res) => {
			const pad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
			gevraagd.push(pad);
			const bestand = join(site, pad.replace(/^\/miel\//, '/').replace(/\/$/, '/index.html'));
			if (!pad.startsWith('/miel/') || !existsSync(bestand)) {
				res.writeHead(404).end();
				return;
			}
			res.writeHead(200, { 'Content-Type': soorten[extname(bestand)] || 'application/octet-stream' });
			res.end(readFileSync(bestand));
		});
		await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
		// In een submap, zoals op GitHub Pages
		const url = `http://127.0.0.1:${server.address().port}/miel/`;

		const browser = await playwright.chromium.launch();
		try {
			const pagina = await browser.newPage();
			const fouten = [];
			pagina.on('pageerror', (e) => fouten.push(e.message));
			await pagina.goto(url);
			await pagina.waitForSelector('#geen-spel:not([hidden])');

			// Een ISO kiezen
			await pagina.setInputFiles('#kies-bestand', iso);
			await pagina.waitForSelector('#wel-spel:not([hidden])', { timeout: 20000 });
			const info = await pagina.textContent('#spel-info');
			assert.match(info, /Miel Monteur staat klaar/);
			assert.match(info, /Miel Monteur\.iso/);

			// Iets kiezen dat het spel niet is
			const ander = join(werk, 'leeg');
			mkdirSync(join(ander, 'x'), { recursive: true });
			writeFileSync(join(ander, 'x', 'iets.txt'), 'hallo');
			await pagina.setInputFiles('#kies-andere-map', ander);
			await pagina.waitForSelector('#fout:not([hidden])', { timeout: 20000 });
			assert.match(await pagina.textContent('#fout'), /geen Miel Monteur/);
			// Het eerder bewaarde spel is er nog
			await pagina.waitForSelector('#wel-spel:not([hidden])');

			// Een map kiezen (de cd als map)
			await pagina.setInputFiles('#kies-andere-map', cd);
			await pagina.waitForFunction(() => /uit “MIELCD”/.test(document.getElementById('spel-info').textContent), null, { timeout: 20000 });

			// Bewaard na opnieuw laden
			await pagina.reload();
			await pagina.waitForSelector('#wel-spel:not([hidden])');

			// Spelen: de nagebootste ScummVM krijgt de bestanden en de opties
			await pagina.click('#spelen');
			await pagina.waitForFunction(() => document.title === 'nep-scummvm gestart', null, { timeout: 20000 });
			const nep = await pagina.evaluate(() => window.nepScummvm);
			assert.deepEqual(nep.opties, ['--config=/mielmonteur/scummvm.ini', 'mielmonteur']);
			assert.equal(nep.bestanden['/mielmonteur/spel/MOVIES/CDDATA.CXT'], 'film CDDATA.CXT'.length);
			assert.ok(nep.bestanden['/mielmonteur/spel/DATA/MIEL32.EXE']);
			assert.match(nep.ini, /\[mielmonteur\][^[]*gameid=garygadget1/);
			assert.match(nep.ini, /path=\/mielmonteur\/spel/);
			assert.match(nep.ini, /gui_language=nl_NL/);

			// ScummVM's /data/... komt uit de submap van de pagina
			const status = await pagina.evaluate(async () => (await fetch('/data/index.json')).status);
			assert.equal(status, 200);
			assert.ok(gevraagd.includes('/miel/data/index.json'));

			// Instellingen bewaard in localStorage, en weer gebruikt
			await pagina.evaluate(() => {
				window.FS.writeFile('/mielmonteur/scummvm.ini', '[scummvm]\nmusic_volume=100\n\n[mielmonteur]\npath=/fout\n');
				document.dispatchEvent(new Event('visibilitychange'));
			});
			await pagina.goto(url);
			await pagina.click('#spelen');
			await pagina.waitForFunction(() => document.title === 'nep-scummvm gestart', null, { timeout: 20000 });
			const ini = await pagina.evaluate(() => window.nepScummvm.ini);
			assert.match(ini, /music_volume=100/);
			assert.match(ini, /path=\/mielmonteur\/spel/);
			assert.doesNotMatch(ini, /path=\/fout/);

			assert.deepEqual(fouten, []);
		} finally {
			await browser.close();
			server.close();
		}
	} finally {
		rmSync(werk, { recursive: true, force: true });
	}
});

// Op een telefoon: aanraken als muis, de knoppen, typen en verplaatsen
(playwright && xorriso ? test : test.skip)('webpagina op een telefoon: aanraken en knoppen', async () => {
	const werk = mkdtempSync(join(tmpdir(), 'miel-mobiel-'));
	try {
		const site = join(werk, 'site');
		mkdirSync(join(site, 'data'), { recursive: true });
		for (const f of ['index.html', 'miel.css', 'miel.js', 'importeren.js', 'bediening.js'])
			copyFileSync(join(hier, '..', 'web', f), join(site, f));
		copyFileSync(join(hier, 'hulp', 'scummvm-nep.js'), join(site, 'scummvm.js'));
		const cd = join(werk, 'cd');
		mkdirSync(join(cd, 'MOVIES'), { recursive: true });
		for (const f of ['00.CXT', 'CDDATA.CXT', '03.DXR', '05.DXR', '94.DXR'])
			writeFileSync(join(cd, 'MOVIES', f), 'x');
		const iso = join(werk, 'miel.iso');
		execFileSync('xorriso', ['-as', 'mkisofs', '-quiet', '-J', '-o', iso, cd], { stdio: 'ignore' });

		const server = createServer((req, res) => {
			const pad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
			const bestand = join(site, pad === '/' ? 'index.html' : pad);
			if (!existsSync(bestand)) {
				res.writeHead(404).end();
				return;
			}
			res.writeHead(200, { 'Content-Type': soorten[extname(bestand)] || 'application/octet-stream' });
			res.end(readFileSync(bestand));
		});
		await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
		const browser = await playwright.chromium.launch();
		try {
			// Een telefoon, liggend
			const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
			const pagina = await context.newPage();
			const fouten = [];
			pagina.on('pageerror', (e) => fouten.push(e.message));
			await pagina.goto(`http://127.0.0.1:${server.address().port}/`);
			await pagina.setInputFiles('#kies-bestand', iso);
			await pagina.waitForSelector('#wel-spel:not([hidden])', { timeout: 20000 });
			await pagina.tap('#spelen');
			await pagina.waitForFunction(() => document.title === 'nep-scummvm gestart', null, { timeout: 20000 });
			// De knoppen staan er op een aanraakscherm vanzelf
			for (const groep of ['pijlen', 'acties', 'extra'])
				assert.ok(await pagina.isVisible(`#bediening .${groep}`), `groep ${groep} zichtbaar`);
			const gebeurtenissen = async () => {
				const g = await pagina.evaluate(() => window.nepGebeurtenissen.splice(0));
				return g;
			};
			await gebeurtenissen();

			// Een tik op het spel: muis erheen, knop in, knop uit (lang genoeg), geen aanraking
			await pagina.touchscreen.tap(400, 200);
			await pagina.waitForTimeout(400);
			let g = await gebeurtenissen();
			const soort = g.map((e) => e.type);
			assert.ok(!soort.some((t) => t.startsWith('touch')), `geen aanraakgebeurtenissen naar het spel: ${soort}`);
			const neer = g.find((e) => e.type === 'mousedown'), op = g.find((e) => e.type === 'mouseup');
			assert.ok(neer && op, `klik: ${soort}`);
			assert.equal(soort.indexOf('mousemove') < soort.indexOf('mousedown'), true, 'eerst erheen, dan klikken');
			assert.ok(op.t - neer.t >= 140, `knop lang genoeg in (${Math.round(op.t - neer.t)} ms)`);
			assert.equal(neer.x, 400);
			assert.equal(neer.y, 200);

			// Slepen met één vinger: bewegen met de knop in
			const cdp = await context.newCDPSession(pagina);
			const raak = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
			await raak('touchStart', 300, 150);
			await pagina.waitForTimeout(120);
			for (let i = 1; i <= 5; i++)
				await raak('touchMove', 300 + i * 20, 150 + i * 10);
			await raak('touchEnd');
			await pagina.waitForTimeout(300);
			g = await gebeurtenissen();
			const bewegen = g.filter((e) => e.type === 'mousemove' && e.buttons === 1);
			assert.ok(bewegen.length >= 3, `slepen met de knop in (${bewegen.length} bewegingen)`);
			assert.deepEqual([g.at(-1).type, g.at(-1).x, g.at(-1).y], ['mouseup', 400, 200]);

			// Een pijltje vasthouden: keydown, en pas bij loslaten keyup
			const pijl = await pagina.locator('#bediening [data-toets="ArrowUp"]').boundingBox();
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pijl.x + 10, y: pijl.y + 10, id: 2 }] });
			await pagina.waitForTimeout(200);
			g = await gebeurtenissen();
			assert.deepEqual(g.map((e) => [e.type, e.key, e.keyCode]), [['keydown', 'ArrowUp', 38]]);
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			await pagina.waitForTimeout(100);
			g = await gebeurtenissen();
			assert.deepEqual(g.map((e) => [e.type, e.key, e.code]), [['keyup', 'ArrowUp', 'ArrowUp']]);

			// Pauze = Escape
			await pagina.tap('#bediening [data-toets="Escape"]');
			await pagina.waitForTimeout(100);
			g = await gebeurtenissen();
			assert.deepEqual(g.map((e) => [e.type, e.key, e.keyCode]), [['keydown', 'Escape', 27], ['keyup', 'Escape', 27]]);

			// Typen met het schermtoetsenbord: toetsen zoals een echt toetsenbord
			await pagina.tap('#bediening .extra .toets');
			assert.equal(await pagina.evaluate(() => document.activeElement.id), 'typveld');
			await pagina.keyboard.insertText('Jo');
			await pagina.waitForTimeout(100);
			g = await gebeurtenissen();
			assert.deepEqual(g.map((e) => [e.type, e.key, e.keyCode, e.charCode]), [
				['keydown', 'J', 74, 0], ['keypress', 'J', 74, 74], ['keyup', 'J', 74, 0],
				['keydown', 'o', 79, 0], ['keypress', 'o', 111, 111], ['keyup', 'o', 79, 0],
			]);
			await pagina.keyboard.press('Backspace');
			await pagina.keyboard.press('Enter');
			await pagina.waitForTimeout(100);
			g = await gebeurtenissen();
			assert.deepEqual(g.filter((e) => e.type === 'keydown').map((e) => e.key), ['Backspace', 'Enter']);

			// Uitzetten en verplaatsen, en dat onthouden
			await pagina.tap('#tandwiel');
			await pagina.locator('#bediening-paneel input[data-groep="acties"]').uncheck();
			assert.ok(!(await pagina.isVisible('#bediening .acties')), 'Pauze/Enter uitgezet');
			await pagina.locator('#verplaatsen').check();
			const voor = await pagina.locator('#bediening .pijlen').boundingBox();
			await pagina.mouse.move(voor.x + 5, voor.y + 5);
			await pagina.mouse.down();
			await pagina.mouse.move(voor.x + 205, voor.y - 95, { steps: 5 });
			await pagina.mouse.up();
			await pagina.tap('#verplaats-klaar');
			assert.ok(await pagina.isVisible('#bediening-paneel'), 'terug in het paneel na verplaatsen');
			await pagina.tap('#bediening-paneel .knoppen .knop:last-child');
			assert.ok(await pagina.isHidden('#bediening-paneel'), 'paneel dicht na Klaar');
			const na = await pagina.locator('#bediening .pijlen').boundingBox();
			assert.ok(Math.abs(na.x - voor.x - 200) < 3 && Math.abs(na.y - voor.y + 100) < 3, `verplaatst naar ${na.x},${na.y}`);
			g = await gebeurtenissen();
			assert.ok(!g.some((e) => e.type === 'keydown'), 'verplaatsen drukt geen toetsen in');
			await pagina.reload();
			await pagina.tap('#spelen');
			await pagina.waitForFunction(() => document.title === 'nep-scummvm gestart', null, { timeout: 20000 });
			assert.ok(!(await pagina.isVisible('#bediening .acties')), 'uit blijft uit');
			const bewaard = await pagina.locator('#bediening .pijlen').boundingBox();
			assert.ok(Math.abs(bewaard.x - na.x) < 3 && Math.abs(bewaard.y - na.y) < 3, 'plaats onthouden');
			if (process.env.MIEL_SCHERMAFDRUK_MOBIEL)
				await pagina.screenshot({ path: process.env.MIEL_SCHERMAFDRUK_MOBIEL });

			assert.deepEqual(fouten, []);
		} finally {
			await browser.close();
			server.close();
		}
	} finally {
		rmSync(werk, { recursive: true, force: true });
	}
});
