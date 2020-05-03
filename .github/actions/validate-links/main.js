const core = require('@actions/core');
const fsPromises = require('fs').promises;
const http = require('http');
const https = require('https');


// TODO: Manually check results?
// TODO: Follow redirects and print redirect URL?
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

function streamToString(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

const checkPolicyURL = async (program) => (
	new Promise((resolve, reject) => {
		try {
			var url = new URL(program.policy_url);
		} catch (error) {
			reject('Not a URL.');
		}

		if (url.protocol === 'https:') {
			var protocol = https;
		} else if (url.protocol === 'http:') {
			var protocol = http;
		} else {
			reject('URL protocol not HTTPS or HTTP.');
		}
	
		var request = protocol.get(url, {'headers': {'Connection': 'close'}}, async response => {
			/*
			response.on('end', () => {
				// TODO: Is this necessary?
				response.destroy();
			}).resume();
			*/
			var fullResponse = await streamToString(response);
			if (response.statusCode === 200) {
				resolve(true);
			} else {
				reject(`Responded with ${response.statusCode} ${response.statusMessage}.\nHeaders: ${response.rawHeaders}\nFull response: ${fullResponse}`);
			};
		}).on('aborted', (error) => {
			reject(error.toString());
		}).on('error', (error) => {
			reject(error.toString());
		});
		request.setTimeout(REQUEST_TIMEOUT, function() {
			request.abort();
			reject(`Request timed out.`);
		});
	})
);


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

	console.log(`Checking policy URLs for ${programsList.length} programs...`);

	Promise.allSettled(programsList.map(checkPolicyURL)).then(results => {
		let invalidURLsCount = 0;
		for (const [programId, result] of results.entries()) {
			if (result.status === 'rejected') {
				++invalidURLsCount;
				let program = programsList[programId];
				console.log(`${programId + 1}. ${program.program_name} (${program.policy_url}): ${result.reason}`);
			}
		}
		if (invalidURLsCount) {
			core.setFailed(`${invalidURLsCount} invalid policy URL${invalidURLsCount === 1? '': 's'} found.`);
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
