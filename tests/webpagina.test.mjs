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
		for (const f of ['index.html', 'miel.css', 'miel.js', 'importeren.js'])
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
