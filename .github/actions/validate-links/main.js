const core = require('@actions/core');
const fsPromises = require('fs').promises;
const http = require('http');
const https = require('https');


// TODO: Try HEAD first, then if not available, GET?


const logResolved = function(programId) {
	console.log(`Program ${programId} returned/resolved.`);
};
const logEnded = function(programId) {
	console.log(`Program ${programId} IncomingMessage ended.`);
};


async function checkProgramLink(program, programId) {
	// TODO: No sense repeating the program and policy_url in all these messages.
	console.log(`Program ${programId} initiated.`);
	try {
		var url = new URL(program.policy_url);
	} catch (error) {
		console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: Invalid URL.`);
		logResolved(programId);
		return false;
	}

	if (url.protocol === 'https:') {
		var protocol = https;
	} else if (url.protocol === 'http:') {
		var protocol = http;
	} else {
		console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: URL protocol not HTTPS or HTTP.`);
		logResolved(programId);
		return false;
	}
	
	return new Promise((resolve) => {
		var request = protocol.get(url, {'headers': {'Connection': 'close'}}, response => {
			response.on('end', () => {
				console.log('http.IncomingMessage.end event.');
				response.destroy();
				logEnded(programId);
			}).resume();
			if (response.statusCode === 200) {
				logResolved(programId);
				resolve(true);
			} else {
				console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: Responded with ${response.statusCode} ${response.statusMessage}.`);
				logResolved(programId);
				resolve(false);
			};
		}).on('error', (error) => {
			console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: ${error.message}`);
			logResolved(programId);
			resolve(false);
		}).on('aborted', (error) => {
			console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: ${error.message}`);
			logResolved(programId);
			resolve(false);
		});
		request.setTimeout(5000, function() {
			request.abort();
			console.log(`Program ${programId} timed out.`);
			resolve(false);
		});
	});
}


var done = false;

(function() {
	var file = await fsPromises.readFile('program-list/program-list.json', 'utf8').catch((error) => {
		core.setFailed(error);
	});

	try {
		var programsList = JSON.parse(file);
	} catch(error) {
		core.setFailed(error);
	}

	console.log(`Checking policy URL for ${programsList.length} programs...`);

	var checks = programsList.map(checkProgramLink);

	Promise.allSettled(checks).then(results => {
		results.forEach(result => {
			if (result.value === false) {
				core.setFailed('Invalid policy URL(s) found.');
			}
		});
	}).then(() => {done = true;});
})();

var timeout = setInterval(() => {
	if (done) {
		clearInterval(timeout);
		console.log('All policy URLs appear to be valid.');
	}
}, 1000);
