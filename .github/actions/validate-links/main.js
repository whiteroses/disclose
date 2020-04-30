const core = require('@actions/core');
const fs = require('fs');
const http = require('http');
const https = require('https');


// TODO: Make a small number of connections at once? Pooling?
// TODO: response timeout limit?
// TODO: Try HEAD first, then if not available, GET?
// TODO: We may not need to pre-validating for new URL and https/http -- just catch the relevant errors?


const checkProgramLink = async (program) => {
	console.log(`${program.program_name}: started ${new Date()}.`);
	try {
		var url = new URL(program.policy_url);
	} catch (error) {
		// url is invalid
		console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: Invalid URL.`);
		return false;
	}

	if (url.protocol === 'https:') {
		var protocol = https;
	} else if (url.protocol === 'http:') {
		var protocol = http;
	} else {
		console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: URL protocol not HTTPS or HTTP.`);
		return false;
	}
	
	return new Promise((resolve) => {
		let request = protocol.get(url, {'headers': {'Connection': 'close'}}, response => {
			response.resume();
			request.abort();
			if (response.statusCode === 200) {
				resolve(true);
			} else {
				console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: Responded with ${response.statusCode} ${response.statusMessage}.`);
				resolve(false);
			};
		}).on('error', (error) => {
			console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: ${error.message}`);
			request.abort();
			resolve(false);
		});
		// TODO: If we use .request() instead of .get(), we need to do var request = protocol.get(...), then request.end().
	});
}


(async () => {
	console.log('Validating program links...');

	try {
		var file = fs.readFileSync('./program-list/program-list.json', 'UTF-8');
	} catch (error) {
		core.setFailed(error.message);
	}

	let programsList = JSON.parse(file);

	let results = [];
	let i = 0;
	while (i < programsList.length) {
		let result = await checkProgramLink(programsList[i]);
		console.log('Ended.');
		results.push(result);
		++i;
	}

	if (results.includes(false)) {
		core.setFailed('Invalid program link(s) found.');
	}
})()
