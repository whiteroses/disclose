const core = require('@actions/core');
const fs = require('fs');
const http = require('http');
const https = require('https');


function isValidLink(link) {
	try {
		console.log("link: " + link);
		var url = new URL(link);
	} catch (error)jjjjjjjjjjjj {
		// url is invalid
		console.log("Invalid URL! " + link);
		console
		return false;
	}
	if (url.protocol === 'https:') {
		var protocol = https;
	} else if (url.protocol === 'http:') {
		var protocol = http;
	} else {
		console.log("Invalid protocol.");
		return false;
	}
	
	protocol.get(url, (response) => {
		console.log("Status code check.");
		response.resume();
		return response.statusCode === 200;
	}).on('error', (error) => {
		console.log(".get() error.");
		return false;
	});
}

function programHasInvalidURL(program) {
	var result = isValidLink(program['policy_url']);
	console.log("undefined? " + result === undefined);
	console.log("null? " + result === null);
	console.log(result + program['policy_url']);
	return !result;
}

try {
	console.log('Validating links...');
	fs.readFile('./program-list/program-list.json', (error, data) => {
		if (error) throw error;
		let json = JSON.parse(data);
		let programsWithBrokenLinks = json.filter(programHasInvalidURL);
		if (programsWithBrokenLinks) {
			let errorMessage = "";
			programsWithBrokenLinks.forEach(function(program) {
				errorMessage += 'Program ' + program['program_name'] + ' has invalid policy_url ' + program["policy_url"] + '.\n';
			});
			throw new Error(errorMessage);
		} else {
			console.log('Links appear to be valid.');
		}
	});
} catch (error) {
	core.setFailed(error.message);
}
