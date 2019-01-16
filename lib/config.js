const logger = require('./logging').createConsoleLogger('Config');
const {existsSync} = require("fs");
const path = require('path');
/**
 * @return {{ courseIDs: String[] }}
 */
const config = (() => {
  if (existsSync(path.resolve(__dirname, '../config.json'))) {
    return require(path.resolve(__dirname, '../config.json'));
  }
  throw 'Nessun file "config.json" trovato!';
})();


/**
 * Invoked after the module's top IIFE, overrides loaded configs with env vars.
 * @return {{ courseIDs: String[] }}
 */
async function load() {
  if (process.env.hasOwnProperty("COURSE_IDS")) {
    logger.info('Usata variabile d\'ambiente COURSE_IDS.');
    secrets['courseIDs'] = process.env['COURSE_IDS'].toString().split(',');
  }

  await checkConfig();
  return config;
}

async function checkConfig() {
  if (!config.courseIDs) {
    throw 'Non hai configurato gli ID dei corsi.';
  }
  if (!Array.isArray(config.courseIDs)) {
    throw 'Non hai configurato correttamente gli ID dei corsi.';
  }
  for (const id of config.courseIDs) {
    if (typeof id !== 'string' && !(id instanceof String)) {
      throw 'Non hai configurato correttamente gli ID dei corsi.';
    }
  }
}

module.exports = {
  load: load
};
