const core = require('@actions/core');
const fs = require('fs');
const http = require('http');
const https = require('https');


// TODO: response timeout limit?
// TODO: Try HEAD first, then if not available, GET?


const checkProgramLink = async (program) => {
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
		protocol.get(url, response => {
			response.resume();
			if (response.statusCode === 200) {
				resolve(true);
			} else {
				console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: Responded with ${response.statusCode} ${response.statusMessage}.`);
				resolve(false);
			};
		}).on('error', (error) => {
			console.log(`Program "${program.program_name}", policy_url ${program.policy_url}: ${error.message}`);
			resolve(false);
		});
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
	programsList.forEach((program) => {
		let result = await checkProgramLink(program);
		results.push(result);
	});

	if (results.includes(false)) {
		core.setFailed('Invalid program link(s) found.');
	}
})()
