// Eind-tot-eindtest van de gebouwde browserversie (de echte ScummVM in
// WebAssembly) in Chromium: een nep-cd via de pagina inlezen, Spelen, en
// ScummVM moet hem als Miel Monteur bouwt auto's herkennen.
//   MIEL_WEB_SITE=dist/web node --test tests/webversie.test.mjs
// Zonder MIEL_WEB_SITE, Playwright of xorriso wordt de test overgeslagen.
// Wat ScummVM in de console schrijft komt in de uitvoer, en een schermafdruk
// in $MIEL_SCHERMAFDRUK (als die gezet is).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';

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
const site = process.env.MIEL_WEB_SITE && resolve(process.env.MIEL_WEB_SITE);

const soorten = {
	'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
	'.wasm': 'application/wasm', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
};

(site && playwright && xorriso ? test : test.skip)('browserversie: ScummVM herkent Miel Monteur', { timeout: 240000 }, async () => {
	const werk = mkdtempSync(join(tmpdir(), 'miel-webversie-'));
	try {
		// Een nep-cd: DATA/MIEL32.EXE met de staart van een Director 6-projector
		// ("79JP" is PJ97 op schijf) en de films waaraan het autospel herkend wordt
		const cd = join(werk, 'MIELCD');
		mkdirSync(join(cd, 'DATA'), { recursive: true });
		mkdirSync(join(cd, 'MOVIES'), { recursive: true });
		const projector = Buffer.alloc(128);
		projector.write('MZ', 0);
		projector.write('79JP', 64);
		projector.writeUInt32LE(64, 124);
		writeFileSync(join(cd, 'DATA', 'MIEL32.EXE'), projector);
		for (const f of ['00.CXT', 'CDDATA.CXT', '03.DXR', '05.DXR', '94.DXR', '10.DXR'])
			writeFileSync(join(cd, 'MOVIES', f), Buffer.alloc(16));
		const iso = join(werk, 'Miel Monteur.iso');
		execFileSync('xorriso', ['-as', 'mkisofs', '-quiet', '-J', '-o', iso, cd], { stdio: 'ignore' });

		// De site in een submap, zoals op GitHub Pages
		const gevraagd = [];
		const server = createServer((req, res) => {
			const pad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
			gevraagd.push(pad);
			let bestand = join(site, pad.replace(/^\/miel\//, '/'));
			if (pad.endsWith('/'))
				bestand = join(bestand, 'index.html');
			if (!pad.startsWith('/miel/') || !existsSync(bestand) || statSync(bestand).isDirectory()) {
				res.writeHead(404).end();
				return;
			}
			res.writeHead(200, { 'Content-Type': soorten[extname(bestand)] || 'application/octet-stream' });
			res.end(readFileSync(bestand));
		});
		await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
		const url = `http://127.0.0.1:${server.address().port}/miel/`;

		const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
		const console_ = [];
		try {
			const pagina = await browser.newPage({ viewport: { width: 1024, height: 768 } });
			pagina.on('console', (m) => console_.push(`[${m.type()}] ${m.text()}`));
			pagina.on('pageerror', (e) => console_.push(`[pageerror] ${e.message}`));
			await pagina.goto(url);
			await pagina.setInputFiles('#kies-bestand', iso);
			await pagina.waitForSelector('#wel-spel:not([hidden])', { timeout: 30000 });
			await pagina.click('#spelen');

			const herkend = /recognised by its movies in 'MOVIES\/', starting 'DATA\/MIEL32\.EXE'/;
			const tot = Date.now() + 180000;
			while (!console_.some((r) => herkend.test(r)) && Date.now() < tot)
				await pagina.waitForTimeout(500);
			// Nog even, voor wat ScummVM daarna doet (met nep-bestanden kan het spel zelf niet starten)
			await pagina.waitForTimeout(5000);
			if (process.env.MIEL_SCHERMAFDRUK)
				await pagina.screenshot({ path: process.env.MIEL_SCHERMAFDRUK });

			console.log('--- console van de browser ---');
			for (const regel of console_)
				console.log(regel.slice(0, 400));
			console.log('--- gevraagde paden ---');
			console.log([...new Set(gevraagd)].join('\n'));

			assert.ok(gevraagd.includes('/miel/scummvm.wasm'), 'scummvm.wasm geladen');
			assert.ok(gevraagd.includes('/miel/data/index.json'), "ScummVM's data uit de submap");
			assert.ok(!gevraagd.some((p) => p.startsWith('/data/')), 'niets uit /data/ van de wortel');
			assert.ok(console_.some((r) => herkend.test(r)), 'ScummVM herkent de nep-cd als Miel Monteur');
		} finally {
			await browser.close();
			server.close();
		}
	} finally {
		rmSync(werk, { recursive: true, force: true });
	}
});
