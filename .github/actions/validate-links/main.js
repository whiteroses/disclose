const core = require('@actions/core');
const fs = require('fs').promises;
const http = require('http');
const https = require('https');


// TODO: Limit for acceptable delay in response?
// TODO: Try HEAD first, then if not available, GET?


const logResolved = function(programId) {
	console.log(`Program ${programId} returned/resolved.`);
};
const logEnded = function(programId) {
	console.log(`Program ${programId} IncomingMessage ended.`);
};


async function checkProgramLink(program, programId) {
	console.log(`Program ${programId} initiated.`);
	try {
		var url = new URL(program.policy_url);
	} catch (error) {
		// url is invalid
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

(async function main() {
	console.log('Validating program links...');

	try {
		var file = await fs.readFile('./program-list/program-list.json', "UTF-8");
	} catch (error) {
		core.setFailed(error.message);
	}

	let programsList = JSON.parse(file);

	let promises = [];
	let programId = 0;
	programsList.forEach(async (program) => {
		++programId;
		var promise = await checkProgramLink(program, programId);
		promises.push(promise);
	});
	console.log(`promises length: ${promises.length}.`);
	console.log(`All promises pushed: ${promises}.`);
	await Promise.allSettled(promises).then(results => {
		console.log(`results: ${results}.`);
		results.forEach(result => {
			console.log(`result.value = ${result.value}.`);
			if (result.value === false) {
				core.setFailed('Invalid program link(s) found.');
			}
		});
	}).then(() => {done = true;});
})();

var timeout = setInterval(() => {
	if (done) {
		clearInterval(timeout);
		console.log('All program links appear valid.');
	}
}, 1000);
