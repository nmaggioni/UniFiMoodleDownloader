const logger = require('./logging').createConsoleLogger('Secrets');
const {existsSync, readFileSync} = require("fs");
const path = require('path');
const yaml = require('yaml');

/**
 * @return {{ moodle_username: String, moodle_password: String }}
 */
const secrets = (() => {
  let localSecrets = false;
  if (existsSync(path.resolve(__dirname, '../secrets.local.yaml'))) {
    logger.info('Trovati secrets locali, carico "secrets.local.yaml".');
    localSecrets = true;
  } else if (existsSync(path.resolve(__dirname, '../secrets.yaml'))) {
    logger.info('Secrets locali non trovati, carico "secrets.yaml".');
  } else {
    throw 'Nessun file "secrets.local.yaml" o "secrets.yaml" trovato!';
  }
  return yaml.parse(readFileSync(path.resolve(__dirname, localSecrets ? '../secrets.local.yaml' : '../secrets.yaml'), 'utf-8'));
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
