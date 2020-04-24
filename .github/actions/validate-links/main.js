const core = require('@actions/core');
const fs = require('fs');
const http = require('http');
const https = require('https');


function isValidLink(link) {
	try {
		var url = new URL(link);
	} catch (error) {
		// url is invalid
		return false;
	}
	if (url.protocol === 'https:') {
		var protocol = https;
	} else if (url.protocol === 'http:') {
		var protocol = http;
	} else {
		return false;
	}
	
	protocol.get(url, (response) => {
		response.resume();
		return response.statusCode === 200;
	}).on('error', (error) => {
		return false;
	});
}

function programHasInvalidURL(program) {
	return !isValidLink(program['policy_url']);
}

try {
	console.log('Validating links...');
	fs.readFile('./program-list/program-list.json', (error, data) => {
		if (error) throw error;
		let json = JSON.parse(data);
		let programsWithBrokenLinks = json.filter(programHasInvalidURL);
		if (programsWithBrokenLinks) {
			let errorMessage = "";
			programsWithBrokenLinks.forEach(function(currentValue) {
				errorMessage += 'Program ' + program['program_name'] + ' has invalid policy_url ' + policy_url + '.\n';
			});
			throw new Error(errorMessage);
		} else {
			console.log('Links appear to be valid.');
		}
	});
} catch (error) {
	core.setFailed(error.message);
}
