const core = require('@actions/core');
const fs = require('fs').promises;
const http = require('http');
const https = require('https');


// TODO: Limit for acceptable delay in response?
// TODO: Try HEAD first, then if not available, GET?


async function checkProgramLink(program) {
	let p = 0;
	const increment = function() {
		++p;
		console.log(`Program ${n} returned/resolved.`);
	};
	let ended = 0;
	const incrementEnded = function() {
		++ended;
		console.log(`${ended} IncomingMessages ended.`);
	};

	try {
		var url = new URL(program.policy_url);
	} catch (error) {
		// url is invalid
		console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: Invalid URL.`);
		increment();
		return false;
	}

	if (url.protocol === 'https:') {
		var protocol = https;
	} else if (url.protocol === 'http:') {
		var protocol = http;
	} else {
		console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: URL protocol not HTTPS or HTTP.`);
		increment();
		return false;
	}
	
	return new Promise((resolve) => {
		protocol.get(url, {'headers': {'Connection': 'close'}}, response => {
			if (response.statusCode === 200) {
				increment();
				resolve(true);
			} else {
				console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: Responded with ${response.statusCode} ${response.statusMessage}.`);
				increment();
				resolve(false);
			};
			response.on('end', () => {
				console.log('http.IncomingMessage.end event.');
				response.destroy();
				incrementEnded();
			}).resume();
		}).on('error', (error) => {
			console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: ${error.message}`);
			increment();
			resolve(false);
		}).on('aborted', (error) => {
			console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: ${error.message}`);
			increment();
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
	Promise.allSettled(promises).then(results => {
		results.forEach(result => {
			if (result.value === false) {
				core.setFailed('Invalid program link(s) found.');
				// TODO: Action should terminate here?
			}
		});
	});
})();
