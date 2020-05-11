const core = require('@actions/core');
const fsPromises = require('fs').promises;
const got = require('got');


const TIMEOUT = 5000;


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
      `Checking policy URLs for ${programsList.length} programs...\n`
    );

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
          `${invalidURLsCount} policy URL` +
          `${invalidURLsCount === 1? '': 's'} require attention.`
        );
      } else {
        console.log('\nAll policy URLs appear to be valid.');
      }
      done = true;
    });
  })();

  // Wait for promise to complete
  const timeout = setInterval(() => {
    if (done) {
      clearInterval(timeout);
    }
  }, 1000);
})();


const checkPolicyURL = (program) => new Promise(
  async (resolve, reject) => {
    let url;
    try {
      url = new URL(program.policy_url);
    } catch (error) {
      resolve('Not a URL.');
    }

    let incomingMessage;
    try {
      incomingMessage = await got(url, {
        //'headers': {
        //  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,' +
        //    'image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;' +
        //    'q=0.9',
        //  'accept-encoding': 'gzip, deflate, br',
        //  'accept-language': 'en-US,en-GB;q=0.9,en;q=0.8',
        //  'connection': 'close',
        //  'cache-control': 'max-age=0',
        //  'sec-fetch-dest': 'document',
        //  'sec-fetch-mode': 'navigate',
        //  'sec-fetch-site': 'none',
        //  'sec-fetch-user': '?1',
        //  'upgrade-insecure-requests': '1',
        //  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
        //    '(KHTML, like Gecko) Chrome/81.0.4044.129 Safari/537.36',
        //},
        //'followRedirect': false, // TODO: Does it follow 303 redirects regardless?
        //'retry': 0,
        //'throwHttpErrors': false, // TODO: non-2xx status codes are resolved instead?
        //'timeout': TIMEOUT,
      });
    } catch (error) {
      resolve(error.toString());
    }

    const statusCode = incomingMessage.statusCode;
    if (statusCode === 200) {
      resolve(true);
    } else {
      let message = '';
      if (statusCode === 404) {
        message = '';
      } else if ([301, 302, 303, 307, 308].includes(statusCode)) {
        message = `(Location: ${incomingMessage.headers['location']})`;
      } else {
        message = `\nHeaders: ${JSON.stringify(incomingMessage.headers)}` +
          `\nBody: ${incomingMessage.body}`;
      }
      resolve(`Responded with ${incomingMessage.statusCode} ` +
        `${incomingMessage.statusMessage}. ${message}`);
    }
  }
);
