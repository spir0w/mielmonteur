// Bediening op telefoons en tablets: aanraken als muis, en knoppen over het
// spel voor wat anders een toetsenbord nodig heeft (pijltjes om te rijden,
// Esc voor het pauzemenu, Enter, letters voor je naam). De knoppen staan in
// groepen die je aan/uit zet en kunt verplaatsen (⚙). Alles gaat als gewone
// muis- en toetsgebeurtenissen naar ScummVM (SDL), net als een echte muis en
// een echt toetsenbord.

const OPSLAG = 'mielmonteur-bediening';

const GROEPEN = {
	pijlen: { naam: 'Pijltjes (rijden)', x: 2, y: 100 },
	acties: { naam: 'Pauze en Enter', x: 100, y: 100 },
	extra: { naam: 'Toetsenbord en volledig scherm', x: 100, y: 2 },
};

// Een tik moet lang genoeg duren: het spel kijkt maar een paar keer per
// seconde of de muisknop ingedrukt is.
const WACHT_VOOR_KLIK = 60;
const MINSTE_KLIK = 150;

const isAanraak = () => window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;

function leesInstellingen() {
	const standaard = { groot: 1, groepen: {} };
	for (const [id, g] of Object.entries(GROEPEN))
		standaard.groepen[id] = { aan: isAanraak(), x: g.x, y: g.y };
	try {
		const opgeslagen = JSON.parse(localStorage.getItem(OPSLAG) || 'null');
		if (opgeslagen?.groepen) {
			for (const id of Object.keys(GROEPEN))
				Object.assign(standaard.groepen[id], opgeslagen.groepen[id] || {});
			standaard.groot = opgeslagen.groot || 1;
		}
	} catch {
		// kapotte of geen opslag: de standaard
	}
	return standaard;
}

function bewaar(instellingen) {
	try {
		localStorage.setItem(OPSLAG, JSON.stringify(instellingen));
	} catch {
		// niet erg
	}
}

// Toetsen -------------------------------------------------------------------------

const TOETSEN = {
	ArrowUp: { code: 'ArrowUp', keyCode: 38 },
	ArrowDown: { code: 'ArrowDown', keyCode: 40 },
	ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
	ArrowRight: { code: 'ArrowRight', keyCode: 39 },
	Escape: { code: 'Escape', keyCode: 27 },
	Enter: { code: 'Enter', keyCode: 13, charCode: 13 },
	Backspace: { code: 'Backspace', keyCode: 8 },
	' ': { code: 'Space', keyCode: 32, charCode: 32 },
};

function toetsInfo(key) {
	if (TOETSEN[key])
		return TOETSEN[key];
	const c = key.toUpperCase();
	if (/^[A-Z]$/.test(c))
		return { code: `Key${c}`, keyCode: c.charCodeAt(0), charCode: key.charCodeAt(0) };
	if (/^[0-9]$/.test(key))
		return { code: `Digit${key}`, keyCode: key.charCodeAt(0), charCode: key.charCodeAt(0) };
	return { code: '', keyCode: 0, charCode: key.codePointAt(0) };
}

// Een toetsgebeurtenis zoals een echt toetsenbord hem geeft. keyCode en
// charCode kunnen niet via de constructor, dus erop gezet.
export function stuurToets(doel, type, key) {
	const info = toetsInfo(key);
	const e = new KeyboardEvent(type, { key, code: info.code, bubbles: true, cancelable: true });
	const charCode = type === 'keypress' ? info.charCode || 0 : 0;
	const keyCode = type === 'keypress' ? charCode : info.keyCode;
	Object.defineProperty(e, 'keyCode', { get: () => keyCode });
	Object.defineProperty(e, 'which', { get: () => keyCode });
	Object.defineProperty(e, 'charCode', { get: () => charCode });
	doel.dispatchEvent(e);
}

function tikToets(doel, key) {
	stuurToets(doel, 'keydown', key);
	if (toetsInfo(key).charCode)
		stuurToets(doel, 'keypress', key);
	stuurToets(doel, 'keyup', key);
}

// Aanraken als muis ----------------------------------------------------------------

// Vingers op het spel worden muisgebeurtenissen: vinger neer = knop in,
// schuiven = slepen met de knop in, loslaten = knop uit. (ScummVM zelf laat
// één vinger alleen de aanwijzer bewegen; slepen kan dan alleen met twee.)
export function aanrakenAlsMuis(canvas) {
	let vinger = null;
	let laatste = null;
	let neerOp = 0;
	let knopIn = false;
	let wachtrij = Promise.resolve();
	const later = (ms) => new Promise((ok) => setTimeout(ok, ms));

	const muis = (type, x, y, knoppen) => {
		const dx = laatste ? x - laatste.x : 0, dy = laatste ? y - laatste.y : 0;
		laatste = { x, y };
		canvas.dispatchEvent(new MouseEvent(type, {
			bubbles: true, cancelable: true, view: window,
			clientX: x, clientY: y, screenX: x, screenY: y,
			movementX: dx, movementY: dy, button: 0, buttons: knoppen,
		}));
	};
	// In volgorde afhandelen: een korte tik wacht op zijn eigen klik
	const daarna = (werk) => {
		wachtrij = wachtrij.then(werk, werk);
	};

	const tegenhouden = (e) => {
		if (!e.isTrusted || e.target !== canvas)
			return false;
		e.stopImmediatePropagation();
		e.preventDefault();
		return true;
	};

	window.addEventListener('touchstart', (e) => {
		if (!tegenhouden(e) || vinger !== null)
			return;
		const t = e.changedTouches[0];
		vinger = t.identifier;
		const x = t.clientX, y = t.clientY;
		daarna(async () => {
			muis('mousemove', x, y, 0);
			await later(WACHT_VOOR_KLIK);
			muis('mousedown', x, y, 1);
			knopIn = true;
			neerOp = performance.now();
		});
	}, { capture: true, passive: false });

	window.addEventListener('touchmove', (e) => {
		if (!tegenhouden(e))
			return;
		for (const t of e.changedTouches) {
			if (t.identifier !== vinger)
				continue;
			const x = t.clientX, y = t.clientY;
			daarna(() => muis('mousemove', x, y, knopIn ? 1 : 0));
		}
	}, { capture: true, passive: false });

	const los = (e) => {
		if (!tegenhouden(e))
			return;
		for (const t of e.changedTouches) {
			if (t.identifier !== vinger)
				continue;
			vinger = null;
			const x = t.clientX, y = t.clientY;
			daarna(async () => {
				const gehouden = performance.now() - neerOp;
				if (gehouden < MINSTE_KLIK)
					await later(MINSTE_KLIK - gehouden);
				muis('mouseup', x, y, 0);
				knopIn = false;
			});
		}
	};
	window.addEventListener('touchend', los, { capture: true, passive: false });
	window.addEventListener('touchcancel', los, { capture: true, passive: false });
}

// Volledig scherm --------------------------------------------------------------------

function volledigSchermKan() {
	return document.fullscreenEnabled || document.webkitFullscreenEnabled;
}

function wisselVolledigScherm(element) {
	const nu = document.fullscreenElement || document.webkitFullscreenElement;
	if (nu)
		(document.exitFullscreen || document.webkitExitFullscreen).call(document);
	else
		(element.requestFullscreen || element.webkitRequestFullscreen).call(element);
}

// De knoppen -------------------------------------------------------------------------

function maak(tag, eigenschappen = {}, kinderen = []) {
	const el = document.createElement(tag);
	Object.assign(el, eigenschappen);
	for (const k of kinderen)
		el.append(k);
	return el;
}

// Een knop die een toets ingedrukt houdt zolang je hem aanraakt
function toetsKnop(canvas, tekst, key, klasse, label) {
	const knop = maak('button', { type: 'button', className: `toets ${klasse || ''}`, textContent: tekst });
	knop.setAttribute('aria-label', label || tekst);
	knop.dataset.toets = key;
	let in_ = false;
	const neer = (e) => {
		e.preventDefault();
		if (knop.closest('.verplaatsen') || in_)
			return;
		in_ = true;
		knop.classList.add('in');
		knop.setPointerCapture?.(e.pointerId);
		stuurToets(canvas, 'keydown', key);
		if (toetsInfo(key).charCode)
			stuurToets(canvas, 'keypress', key);
	};
	const op = (e) => {
		e.preventDefault();
		if (!in_)
			return;
		in_ = false;
		knop.classList.remove('in');
		stuurToets(canvas, 'keyup', key);
	};
	knop.addEventListener('pointerdown', neer);
	knop.addEventListener('pointerup', op);
	knop.addEventListener('pointercancel', op);
	knop.addEventListener('lostpointercapture', op);
	knop.addEventListener('contextmenu', (e) => e.preventDefault());
	return knop;
}

// Een onzichtbaar tekstvak voor het schermtoetsenbord: wat je typt gaat als
// toetsen naar het spel (je naam bij het begin). Er staat altijd één spatie
// in, anders geeft Android geen gebeurtenis voor de wis-toets.
function maakTypveld(canvas) {
	const veld = maak('input', { id: 'typveld', type: 'text', value: ' ', autocomplete: 'off', spellcheck: false });
	veld.setAttribute('autocapitalize', 'off');
	veld.setAttribute('aria-label', 'Typen in het spel');
	const herstel = () => {
		veld.value = ' ';
		veld.setSelectionRange(1, 1);
	};
	for (const type of ['keydown', 'keypress', 'keyup']) {
		veld.addEventListener(type, (e) => {
			// De echte toetsen van het schermtoetsenbord niet ook nog naar het spel
			e.stopPropagation();
			if (type === 'keydown' && ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
				e.preventDefault();
				tikToets(canvas, e.key);
			}
		});
	}
	veld.addEventListener('input', (e) => {
		if (e.inputType === 'deleteContentBackward' || veld.value.length === 0) {
			tikToets(canvas, 'Backspace');
		} else if (e.inputType === 'insertLineBreak') {
			tikToets(canvas, 'Enter');
		} else {
			const tekst = e.data ?? veld.value.slice(1);
			for (const teken of tekst)
				tikToets(canvas, teken);
		}
		herstel();
	});
	veld.addEventListener('focus', herstel);
	return veld;
}

export function maakBediening(speelveld, canvas) {
	const instellingen = leesInstellingen();
	const laag = maak('div', { id: 'bediening' });
	laag.style.setProperty('--groot', instellingen.groot);

	const pijlen = maak('div', { className: 'groep pijlen' }, [
		toetsKnop(canvas, '▲', 'ArrowUp', 'boven', 'Omhoog / gas'),
		toetsKnop(canvas, '◀', 'ArrowLeft', 'links', 'Links'),
		toetsKnop(canvas, '▶', 'ArrowRight', 'rechts', 'Rechts'),
		toetsKnop(canvas, '▼', 'ArrowDown', 'onder', 'Omlaag / rem'),
	]);
	const acties = maak('div', { className: 'groep acties' }, [
		toetsKnop(canvas, 'Pauze', 'Escape', 'breed', 'Pauzemenu (Esc)'),
		toetsKnop(canvas, 'Enter ⏎', 'Enter', 'breed', 'Enter'),
	]);
	const typveld = maakTypveld(canvas);
	const toetsenbordKnop = maak('button', { type: 'button', className: 'toets', textContent: '⌨' });
	toetsenbordKnop.setAttribute('aria-label', 'Toetsenbord (typen)');
	toetsenbordKnop.addEventListener('pointerdown', (e) => e.preventDefault());
	toetsenbordKnop.addEventListener('click', () => {
		if (laag.classList.contains('verplaatsen'))
			return;
		if (document.activeElement === typveld)
			typveld.blur();
		else
			typveld.focus();
	});
	const extraKnoppen = [toetsenbordKnop];
	if (volledigSchermKan()) {
		const vs = maak('button', { type: 'button', className: 'toets', textContent: '⛶' });
		vs.setAttribute('aria-label', 'Volledig scherm');
		vs.addEventListener('click', () => {
			if (!laag.classList.contains('verplaatsen'))
				wisselVolledigScherm(speelveld);
		});
		extraKnoppen.push(vs);
	}
	const extra = maak('div', { className: 'groep extra' }, extraKnoppen);
	const groepen = { pijlen, acties, extra };

	// Plaats en zichtbaarheid
	// Altijd helemaal in beeld, ook op een laag scherm of na het draaien
	// (de bewaarde plaats blijft dezelfde).
	const zetGroep = (id) => {
		const g = instellingen.groepen[id];
		const el = groepen[id];
		el.hidden = !g.aan;
		const b = speelveld.getBoundingClientRect();
		if (el.hidden || !b.width) {
			el.style.left = `${g.x}%`;
			el.style.top = `${g.y}%`;
			return;
		}
		const x = Math.min(Math.max(b.width * g.x / 100, 0), Math.max(b.width - el.offsetWidth, 0));
		const y = Math.min(Math.max(b.height * g.y / 100, 0), Math.max(b.height - el.offsetHeight, 0));
		el.style.left = `${x}px`;
		el.style.top = `${y}px`;
	};
	const zetAlles = () => Object.keys(groepen).forEach(zetGroep);
	window.addEventListener('resize', zetAlles);
	document.addEventListener('fullscreenchange', zetAlles);
	for (const [id, el] of Object.entries(groepen)) {
		el.dataset.groep = id;
		zetGroep(id);
		laag.append(el);
	}

	// Verplaatsen: in de verplaatsstand sleep je een groep waarheen je wilt
	for (const [id, el] of Object.entries(groepen)) {
		let begin = null;
		el.addEventListener('pointerdown', (e) => {
			if (!laag.classList.contains('verplaatsen'))
				return;
			e.preventDefault();
			e.stopPropagation();
			el.setPointerCapture(e.pointerId);
			const r = el.getBoundingClientRect();
			begin = { dx: e.clientX - r.left, dy: e.clientY - r.top };
		}, true);
		el.addEventListener('pointermove', (e) => {
			if (!begin)
				return;
			const b = speelveld.getBoundingClientRect();
			const r = el.getBoundingClientRect();
			const x = Math.min(Math.max(e.clientX - begin.dx - b.left, 0), b.width - r.width);
			const y = Math.min(Math.max(e.clientY - begin.dy - b.top, 0), b.height - r.height);
			instellingen.groepen[id].x = +(100 * x / b.width).toFixed(2);
			instellingen.groepen[id].y = +(100 * y / b.height).toFixed(2);
			zetGroep(id);
		});
		const klaar = () => {
			if (begin)
				bewaar(instellingen);
			begin = null;
		};
		el.addEventListener('pointerup', klaar);
		el.addEventListener('pointercancel', klaar);
	}

	// Het tandwiel en het paneel met instellingen
	const paneel = maak('div', { id: 'bediening-paneel', hidden: true });
	paneel.append(maak('h3', { textContent: 'Knoppen op het scherm' }));
	for (const [id, g] of Object.entries(GROEPEN)) {
		const vak = maak('input', { type: 'checkbox', checked: instellingen.groepen[id].aan });
		vak.dataset.groep = id;
		vak.addEventListener('change', () => {
			instellingen.groepen[id].aan = vak.checked;
			zetGroep(id);
			bewaar(instellingen);
		});
		paneel.append(maak('label', {}, [vak, ` ${g.naam}`]));
	}
	// Verplaatsen: het paneel gaat weg (anders ligt het over de knoppen), er
	// komt één knop "Klaar" voor in de plaats.
	const verplaatsKlaar = maak('button', { type: 'button', id: 'verplaats-klaar', className: 'knop', hidden: true, textContent: 'Sleep de knoppen · Klaar' });
	const verplaatsVak = maak('input', { type: 'checkbox', id: 'verplaatsen' });
	const zetVerplaatsen = (aan) => {
		verplaatsVak.checked = aan;
		laag.classList.toggle('verplaatsen', aan);
		verplaatsKlaar.hidden = !aan;
		paneel.hidden = aan;
	};
	verplaatsVak.addEventListener('change', () => zetVerplaatsen(verplaatsVak.checked));
	verplaatsKlaar.addEventListener('click', () => zetVerplaatsen(false));
	paneel.append(maak('label', {}, [verplaatsVak, ' Knoppen verplaatsen (sleep ze)']));
	const grootte = maak('input', { type: 'range', min: '0.7', max: '1.6', step: '0.1', value: String(instellingen.groot) });
	grootte.addEventListener('input', () => {
		instellingen.groot = +grootte.value;
		laag.style.setProperty('--groot', grootte.value);
		zetAlles();
		bewaar(instellingen);
	});
	paneel.append(maak('label', {}, ['Grootte ', grootte]));
	const herstel = maak('button', { type: 'button', className: 'knop', textContent: 'Standaardplaatsen' });
	herstel.addEventListener('click', () => {
		for (const [id, g] of Object.entries(GROEPEN))
			Object.assign(instellingen.groepen[id], { x: g.x, y: g.y });
		for (const id of Object.keys(GROEPEN))
			zetGroep(id);
		bewaar(instellingen);
	});
	const sluit = maak('button', { type: 'button', className: 'knop', textContent: 'Klaar' });
	sluit.addEventListener('click', () => {
		zetVerplaatsen(false);
		paneel.hidden = true;
		canvas.focus();
	});
	paneel.append(maak('p', { className: 'uitleg', textContent: 'Tik = klikken, slepen = onderdelen verslepen.' }));
	paneel.append(maak('div', { className: 'knoppen' }, [herstel, sluit]));

	const tandwiel = maak('button', { type: 'button', id: 'tandwiel', textContent: '⚙' });
	tandwiel.setAttribute('aria-label', 'Knoppen op het scherm instellen');
	tandwiel.addEventListener('click', () => {
		paneel.hidden = !paneel.hidden;
	});

	const draai = maak('div', { id: 'draai-hint', textContent: 'Draai je scherm voor een groter spel' });
	draai.addEventListener('pointerdown', () => draai.remove());

	// Wat op de knoppen gebeurt, is niet voor het spel (dat luistert soms op
	// het hele document). Toetsgebeurtenissen gaan via stuurToets.
	for (const el of [laag, tandwiel, paneel, typveld, draai, verplaatsKlaar]) {
		for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'contextmenu'])
			el.addEventListener(type, (e) => e.stopPropagation());
	}
	for (const type of ['keydown', 'keypress', 'keyup']) {
		paneel.addEventListener(type, (e) => e.stopPropagation());
	}

	speelveld.append(laag, tandwiel, paneel, verplaatsKlaar, typveld, draai);
	// Pas nu de groepen in beeld zijn, kunnen ze gemeten worden; en opnieuw
	// als ze van maat veranderen (het lettertype komt later binnen).
	zetAlles();
	if (window.ResizeObserver) {
		const kijker = new ResizeObserver(zetAlles);
		for (const el of Object.values(groepen))
			kijker.observe(el);
	}
	document.fonts?.ready.then(zetAlles);
	aanrakenAlsMuis(canvas);
	return { laag, groepen, paneel, typveld };
}
