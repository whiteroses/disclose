const core = require('@actions/core');
const fs = require('fs').promises;
const http = require('http');
const https = require('https');


// TODO: Limit for acceptable delay in response?
// TODO: Try HEAD first, then if not available, GET?


var p = 0;

const logInitiated = function() {
	++p;
	console.log(`Program ${p} initiated.`);
};
const logResolved = function(programNumber) {
	console.log(`Program ${programNumber} returned/resolved.`);
};
const logEnded = function(programNumber) {
	console.log(`Program ${programNumber} IncomingMessage ended.`);
};


async function checkProgramLink(program) {
	logInitiated();
	try {
		var url = new URL(program.policy_url);
	} catch (error) {
		// url is invalid
		console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: Invalid URL.`);
		logResolved(p);
		return false;
	}

	if (url.protocol === 'https:') {
		var protocol = https;
	} else if (url.protocol === 'http:') {
		var protocol = http;
	} else {
		console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: URL protocol not HTTPS or HTTP.`);
		logResolved(p);
		return false;
	}
	
	return new Promise((resolve) => {
		protocol.get(url, {'headers': {'Connection': 'close'}}, response => {
			response.on('end', () => {
				console.log('http.IncomingMessage.end event.');
				response.destroy();
				logEnded();
			}).resume();
			if (response.statusCode === 200) {
				logResolved(p);
				resolve(true);
			} else {
				console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: Responded with ${response.statusCode} ${response.statusMessage}.`);
				logResolved(p);
				resolve(false);
			};
		}).on('error', (error) => {
			console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: ${error.message}`);
			logResolved(p);
			resolve(false);
		}).on('aborted', (error) => {
			console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: ${error.message}`);
			logResolved(p);
			resolve(false);
		});
	});
}


(async function main() {
	console.log('Validating program links...');

	try {
		var file = await fs.readFile('./program-list/program-list.json', "UTF-8");
	} catch (error) {
		core.setFailed(error.message);
	}

	let programsList = JSON.parse(file);

	let promises = [];
	programsList.forEach(async (program) => {
		var promise = await checkProgramLink(program);
		promises.push(promise);
	});
	console.log('All promises pushed.');
	Promise.allSettled(promises).then(results => {
		results.forEach(result => {
			if (result.value === false) {
				core.setFailed('Invalid program link(s) found.');
				// TODO: Action should terminate here?
			}
		});
	});
})();
