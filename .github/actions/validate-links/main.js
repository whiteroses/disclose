const core = require('@actions/core');
const fsPromises = require('fs').promises;
const http = require('http');
const https = require('https');


// TODO: MicroWeber false positive? PasteCoin?
// This is strange: the page seems to 404, but meta refresh to or from a page
// with 302 message outside the html? The intention is clearly for a redirect
// from .com to .org?
// TODO: DigitalOcean redirecting to same URL?
// TODO: Manually check results?
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

function streamToString(stream, encoding) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString(encoding)));
  });
}

const checkPolicyURL = async (program) => (
  new Promise((resolve, reject) => {
    let protocol;
    let url;
    try {
      url = new URL(program.policy_url);
    } catch (error) {
      resolve('Not a URL.');
    }

    if (url.protocol === 'https:') {
      protocol = https;
    } else if (url.protocol === 'http:') {
      protocol = http;
    } else {
      resolve('URL protocol not HTTPS or HTTP.');
    }

    const request = protocol.get(url, {'headers': {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,;' +
        'image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;' +
        'q=0.9',
      'accept-encoding': 'gzip, deflate, br',
      'accept-language': 'en-US,en-GB;q=0.9,en;q=0.8',
      'connection': 'close',
      'cache-control': 'max-age=0',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/81.0.4044.129 Safari/537.36',
    }}, async (response) => {
      /*
      response.on('end', () => {
        // TODO: Is this necessary?
        response.destroy();
      }).resume();
      */
      const contentType = response.headers['content-type'];
      let encoding;
      try {
        encoding = (
          contentType.split('=')[1].trim().toLowerCase() === 'iso-8859-1'?
          'latin1': 'utf8');
      } catch (exception) {
        encoding = 'utf8';
      }
      const responseBody = await streamToString(response, encoding);
      const statusCode = response.statusCode;
      if (statusCode === 200) {
        resolve(true);
      } else {
        let message = '';
        if (statusCode === 404) {
          message = '';
        } else if ([301, 302, 303, 307, 308].includes(statusCode)) {
          message = `(Location: ${response.headers['location']})`;
        } else {
          message = `\n(Headers: ${JSON.stringify(response.headers)}\nBody:` +
           `${responseBody})`;
        }
        resolve(`Responded with ${response.statusCode} ` +
          `${response.statusMessage}. ${message}`);
      };
    }).on('aborted', (error) => {
      resolve(error.toString());
    }).on('error', (error) => {
      resolve(error.toString());
    });
    request.setTimeout(REQUEST_TIMEOUT, function() {
      request.abort();
      resolve(`Request timed out.`);
    });
  })
);


(() => {
  let done = false;

  (async function() {
    const file = await fsPromises.readFile(
      'program-list/program-list.json', 'utf8',
    ).catch((error) => {
      core.setFailed(error);
    });

    let programsList;
    try {
      programsList = JSON.parse(file);
    } catch (error) {
      core.setFailed(error);
    }

    console.log(
      `Checking policy URLs for ${programsList.length} programs...\n`);

    Promise.allSettled(programsList.map(checkPolicyURL)).then((results) => {
      let invalidURLsCount = 0;
      for (const [programId, result] of results.entries()) {
        const program = programsList[programId];
        const messageProgramPart = `${programId + 1}. ` +
          `${program.program_name} (${program.policy_url}): `;
        if (result.status === 'fulfilled') {
          if (result.value !== true) {
            ++invalidURLsCount;
            console.log(messageProgramPart + `${result.value}\n`);
          }
        } else {
          console.log(messageProgramPart + `${result.reason}\n`);
        }
      }
      if (invalidURLsCount) {
        core.setFailed(
          `\n${invalidURLsCount} policy URL` +
          `${invalidURLsCount === 1? '': 's'} require attention.`);
      } else {
        console.log('\nAll policy URLs appear to be valid.');
      }
      done = true;
    });
  })();

  const timeout = setInterval(() => {
    if (done) {
      clearInterval(timeout);
    }
  }, 1000);
})();
