const winston = require('winston');
require('winston-daily-rotate-file');

const transport = new winston.transports.DailyRotateFile({
    filename: 'logs/barberia-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '5m',
    maxFiles: '14d',
    zippedArchive: true
});

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, message }) => `[${timestamp}] ${message}`)
    ),
    transports: [
        transport,
        new winston.transports.Console()
    ]
});

module.exports = (mensaje) => logger.info(mensaje);