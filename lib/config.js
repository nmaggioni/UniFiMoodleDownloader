const logger = require('./logging').createConsoleLogger('Config');
const {existsSync, readFileSync} = require("fs");
const path = require('path');
const yaml = require('yaml');

/**
 * Loads and parses the config file.
 * @return {{ courseIDs: String[] }}
 */
const config = (() => {
  let config;
  let localConfig = false;
  if (existsSync(path.resolve(__dirname, '../config.local.yaml'))) {
    logger.info('Trovata configurazione locale, carico "config.local.yaml".');
    localConfig = true;
  } else if (existsSync(path.resolve(__dirname, '../config.yaml'))) {
    logger.info('Configurazione locale non trovata, carico "config.yaml".');
  } else {
    throw 'Nessun file "config.local.yaml" o "config.yaml" trovato!';
  }
  config = yaml.parse(readFileSync(path.resolve(__dirname, localConfig ? '../config.local.yaml' : '../config.yaml'), 'utf-8'));
  return config;
})();


/**
 * Invoked after the module's top IIFE, overrides loaded configs with env vars.
 * @return {{ courseIDs: String[] }}
 */
async function load() {
  if (process.env.hasOwnProperty("COURSE_IDS")) {
    logger.info('Usata variabile d\'ambiente COURSE_IDS.');
    config['courseIDs'] = process.env['COURSE_IDS'].toString().split(',');
  }

  await checkConfig();
  return config;
}

async function checkConfig() {
  if (!["internal", "aria2"].includes(config.downloader)) {
    throw 'Hai impostato un downloader sconosciuto.';
  }
  if (!config.courseIDs) {
    throw 'Non hai configurato gli ID dei corsi.';
  }
  if (!config.courseIDs.length) {
    throw 'Non hai configurato correttamente gli ID dei corsi.';
  }
  for (const id of config.courseIDs) {
    if (typeof id !== 'number' && isNaN(id)) {
      throw 'Non hai configurato correttamente gli ID dei corsi.';
    }
  }
}

module.exports = {
  load: load
};
