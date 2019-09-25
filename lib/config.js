const logger = require('./logging').createConsoleLogger('Config');
const {existsSync} = require("fs");
const path = require('path');
/**
 * Loads the courses' IDs and ignores the ones prepended by '#'
 * @return {{ courseIDs: String[] }}
 */
const config = (() => {
  let config;
  if (existsSync(path.resolve(__dirname, '../config.local.json'))) {
    logger.info('Trovata configurazione locale, carico "config.local.json".');
    config = require(path.resolve(__dirname, '../config.local.json'));
  } else if (existsSync(path.resolve(__dirname, '../config.json'))) {
    logger.info('Configurazione locale non trovata, carico "config.json".');
    config = require(path.resolve(__dirname, '../config.json'));
  } else {
    throw 'Nessun file "config.local.json" o "config.json" trovato!';
  }
  config.courseIDs = config.courseIDs.filter((el) => !el.startsWith('#'));
  return config;
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
