const logger = require('./logging').createConsoleLogger('Secrets');
const {existsSync} = require("fs");
const path = require('path');
/**
 * @return {{ moodle_username: String, moodle_password: String }}
 */
const secrets = (() => {
  if (existsSync(path.resolve(__dirname, '../secrets.local.json'))) {
    logger.info('Trovati secrets locali, carico "secrets.local.json".');
    return require(path.resolve(__dirname, '../secrets.local.json'));
  } else if (existsSync(path.resolve(__dirname, '../secrets.json'))) {
    logger.info('Secrets locali non trovati, carico "secrets.json".');
    return require(path.resolve(__dirname, '../secrets.json'));
  }
  throw 'Nessun file "secrets.local.json" o "secrets.json" trovato!';
})();


/**
 * Invoked after the module's top IIFE, overrides loaded secrets with env vars.
 * @return {{ moodle_username: String, moodle_password: String }}
 */
async function load() {
  let keys = Object.keys(secrets);
  await Promise.all(keys.map(async (key) => {
    if (process.env.hasOwnProperty(key.toUpperCase())) {
      logger.info(`Usata variabile d'ambiente ${key.toUpperCase()}.`);
      secrets[key] = process.env[key.toUpperCase()].toString();
    }
  }));
  await checkSecrets();
  return secrets;
}

async function checkSecrets() {
  if (!secrets.moodle_username) {
    throw 'Non hai configurato l\'username.';
  }
  if (!secrets.moodle_password) {
    throw 'Non hai configurato la password.';
  }
}

module.exports = {
  load: load
};
