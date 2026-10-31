// Een nagebootste scummvm.js voor de test van de webpagina: doet wat
// Emscripten doet (Module.preRun, run dependencies, FS, opties uit #) en
// onthoudt wat de pagina klaarzette, zonder ScummVM zelf.
(function () {
	var Module = window.Module;
	var opties = decodeURI(window.location.hash.substring(1)).split(' ');
	var data = {};
	var wachten = 0;
	var gestart = false;
	window.FS = {
		mkdirTree: function (pad) {
			data[pad + '/'] = '';
		},
		writeFile: function (pad, inhoud) {
			data[pad] = inhoud;
		},
		readFile: function (pad) {
			var d = data[pad];
			return typeof d === 'string' ? d : new TextDecoder().decode(d);
		},
	};
	window.addRunDependency = function () {
		wachten++;
	};
	window.removeRunDependency = function () {
		if (--wachten === 0)
			main();
	};
	function main() {
		if (gestart)
			return;
		gestart = true;
		var bestanden = {};
		Object.keys(data).forEach(function (pad) {
			if (pad.slice(-1) !== '/')
				bestanden[pad] = data[pad].length;
		});
		window.nepScummvm = { opties: opties, bestanden: bestanden, ini: window.FS.readFile('/mielmonteur/scummvm.ini') };
		document.title = 'nep-scummvm gestart';
	}
	(Module.preRun || []).forEach(function (f) {
		f();
	});
	if (!wachten)
		main();
})();
