const winston = require('winston');

const logLevel = 'info';

function createConsoleLogger(label) {
  return winston.createLogger({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.label({ label: label }),
      winston.format.timestamp(),
      winston.format.printf(info => {
        return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
      })
    ),
    transports: [
      new winston.transports.Console()
    ],
    level: logLevel,
    prettyPrint: true,
    colorize: true
  });
}

module.exports = {
  createConsoleLogger: createConsoleLogger
};
