const core = require('@actions/core');
const fsPromises = require('fs').promises;
const http = require('http');
const https = require('https');


// TODO: Try HEAD first, then if not available, GET?

// TODO: Remove?
/*
const logResolved = function(programId) {
	console.log(`Program ${programId} returned/resolved.`);
};
const logEnded = function(programId) {
	console.log(`Program ${programId} IncomingMessage ended.`);
};
*/
const REQUEST_TIMEOUT = 5000;

async function checkPolicyURL(program, programId) {
	try {
		var url = new URL(program.policy_url);
	} catch (error) {
		return [programId, 'Not a URL.'];
	}

	if (url.protocol === 'https:') {
		var protocol = https;
	} else if (url.protocol === 'http:') {
		var protocol = http;
	} else {
		return [programId, 'URL protocol not HTTPS or HTTP.'];
	}
	
	return new Promise((resolve) => {
		var request = protocol.get(url, {'headers': {'Connection': 'close'}}, response => {
			response.on('end', () => {
				// TODO: Is this necessary?
				response.destroy();
			}).resume();
			if (response.statusCode === 200) {
				resolve(true);
			} else {
				resolve([programId, `Responded with ${response.statusCode} ${response.statusMessage}.`]);
			};
		}).on(['error', 'aborted'], (error) => {
			resolve([programId, error.toString()]);
		});
		request.setTimeout(REQUEST_TIMEOUT, function() {
			request.abort();
			resolve([programId, `Request ${programId} timed out.`]);
		});
	});
}


var done = false;

(async function() {
	var file = await fsPromises.readFile('program-list/program-list.json', 'utf8').catch((error) => {
		core.setFailed(error);
	});

	try {
		var programsList = JSON.parse(file);
	} catch(error) {
		core.setFailed(error);
	}

	console.log(`Checking policy URL for ${programsList.length} programs...`);

	var checks = programsList.map(checkPolicyURL);

	Promise.allSettled(checks).then(results => {
		var invalidPrograms = results.filter(result => (result !== true));
		if (invalidPrograms.length) {
			for (const invalidProgram of invalidPrograms) {
				let [programId, message] = invalidProgram;
				let program = programsList[programId];
				console.log(`Program "${programId + 1}. ${program.program_name}" (policy_url ${program.policy_url}): ${message}.`);
			}
			core.setFailed('Invalid policy URL(s) found.');
		} else {
			console.log('All policy URLs appear to be valid.');
		}
		done = true;
	});
})();

var timeout = setInterval(() => {
	if (done) {
		clearInterval(timeout);
	}
}, 1000);
