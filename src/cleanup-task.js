const config = require('config');
const axios = require('axios').default;
const fs = require('fs');
const _ = require('lodash');
const logger = CreateLogger();

function CreateLogger() {
  const MCLogger = require('@map-colonies/mc-logger').MCLogger;
  const loggerConf = config.get('logger');
  const serviceConf = require('../package.json');
  const logger = new MCLogger(loggerConf, serviceConf);
  return logger;
}

async function getExpiredBatch(batchSize, offset) {
  let dbServiceUrl = config.get('dbServiceUrl');
  if (!dbServiceUrl.endsWith('/')) {
    dbServiceUrl += '/';
  }
  const now = new Date().toISOString();
  // TODO: replace lines when pagination is added
  // const url = `${dbServiceUrl}statuses/expired/${now}?size=${batchSize}&offset=${offset}`;
  const url = `${dbServiceUrl}statuses/expired/${now}`;
  try {
    const res = await axios.get(url);
    return res.data;
  } catch (error) {
    let body = _.get(error, 'response.data', '');
    body = JSON.stringify(body);
    logger.error(
      `failed to retrieve expired files from db: ${error.message}, body:${body}`
    );
    return []; // throw instead if service should exit with failed status
  }
}

async function deleteFromDb(deletedIds) {
  const maxRetries = config.get('maxRetries');
  let dbServiceUrl = config.get('dbServiceUrl');
  if (!dbServiceUrl.endsWith('/')) {
    dbServiceUrl += '/';
  }
  const url = `${dbServiceUrl}statuses/delete`;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await axios.post(url, deletedIds);
      break;
    } catch (error) {
      let body = _.get(error, 'response.data', '');
      body = JSON.stringify(body);
      logger.error(
        `filed to delete files from db. attempt ${i} of ${maxRetries}. filed ids: ${deletedIds.toString()}. body: ${body}`
      );
    }
  }
}

function deleteFiles(files) {
  const deleted = [];
  const exportDirectory = config.get('exportDirectory');
  files.forEach((file) => {
    let path = `${exportDirectory}/`;
    if (file.directoryName) {
      path += `${file.directoryName}/`;
    }
    path += file.fileName;
    if (fs.existsSync(path)) {
      try {
        logger.info(`deleting file: ${path} task id: ${file.taskId}.`);
        fs.unlinkSync(path);
        deleted.push(file.taskId);
      } catch (err) {
        logger.error(
          `filed to delete file: ${path} task id: ${file.taskId}, ${err.message}`
        );
        logger.error(`err: ${JSON.stringify(err)}`);
      }
    } else {
      deleted.push(file.taskId);
    }
  });
  return deleted;
}

async function deleteBatch(batchSize, offset) {
  const files = await getExpiredBatch(batchSize, offset);
  if (files.length === 0) {
    return true;
  }
  const deleted = deleteFiles(files);
  deleteFromDb(deleted);
  return files.length !== batchSize;
}

async function main() {
  const batchSize = config.get('batchSize');
  let offset = 0;
  let done = false;
  do {
    done = await deleteBatch(batchSize, offset);
    offset += batchSize;
  } while (!done);
}

main();
