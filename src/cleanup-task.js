const config = require('config');
const { exception } = require('console');
const axios = require('axios').default;
const fs = require('fs');
const _ = require('lodash');
const logger = CreateLogger();
let s3Client;

function CreateLogger() {
  const MCLogger = require('@map-colonies/mc-logger').MCLogger;
  const loggerConf = config.get('logger');
  const serviceConf = require('../package.json');
  const logger = new MCLogger(loggerConf, serviceConf);
  return logger;
}

async function getExpiredBatch(batchSize, offset) {
  let dbServiceUrl = config.get('db.ServiceUrl');
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
  const maxRetries = config.get('db.MaxRetries');
  let dbServiceUrl = config.get('db.ServiceUrl');
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
        `failed to delete files from db. attempt ${i} of ${maxRetries}. failed ids: ${deletedIds.toString()}. body: ${body}`
      );
    }
  }
}

async function deleteFilesFS(files) {
  const deleted = new Set();
  const exportDirectory = config.get('exportDirectory');
  const formats = config.get('fileFormats');
  files.forEach((file) => {
    let path = `${exportDirectory}/`;
    if (file.directoryName) {
      path += `${file.directoryName}/`;
    }
    path += file.fileName;
    formats.forEach((format) => {
      const fullPath = `${path}.${format}`;
      if (fs.existsSync(fullPath)) {
        try {
          logger.info(`deleting file: ${fullPath} task id: ${file.taskId}.`);
          fs.unlinkSync(fullPath);
          deleted.add(file.taskId);
        } catch (err) {
          logger.error(
            `failed to delete file: ${fullPath} task id: ${file.taskId}, ${err.message}`
          );
          logger.error(`err: ${JSON.stringify(err)}`);
        }
      }
    });
    if (!deleted.has(file.taskId)) {
      logger.warn(
        `deleting record ${file.taskId} with missing file: ${path} . file full path: ${file.fileURI} .`
      );
      deleted.add(file.taskId);
    }
  });
  return Promise.resolve(Array.from(deleted));
}

function getS3Client() {
  if (s3Client === undefined) {
    const S3 = require('aws-sdk/clients/s3');
    const s3Config = config.get('s3');
    const clientConfig = {
      apiVersion: s3Config.apiVersion,
      endpoint: s3Config.endpoint,
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
      maxRetries: s3Config.maxRetries,
      sslEnabled: s3Config.sslEnabled,
      s3ForcePathStyle: true
    };
    s3Client = new S3(clientConfig);
  }
  return s3Client;
}

async function deleteFilesS3(files) {
  const s3Client = getS3Client();
  const formats = config.get('fileFormats');
  const parms = {
    Bucket: config.get('s3.bucket'),
    Delete: {
      Objects: []
    }
  };
  const taskDic = {};
  files.forEach((file) => {
    let path = '';
    if (file.directoryName) {
      path += `${file.directoryName}/`;
    }
    path += file.fileName;
    formats.forEach((format) => {
      const fullPath = `${path}.${format}`;
      taskDic[fullPath] = file.taskId;
      parms.Delete.Objects.push({ Key: fullPath });
      logger.info(`deleting file: ${fullPath} task id: ${file.taskId}.`);
    });
  });
  return new Promise((resolve, reject) => {
    s3Client.deleteObjects(parms, (err, data) => {
      const deleted = new Set();
      if (err) {
        logger.error(`failed to delete from s3: ${JSON.stringify(err)}`);
      } else {
        // get deleted from data
        data.Deleted.forEach((file) => {
          deleted.add(taskDic[file.Key]);
          logger.info(
            `file deleted: ${file.Key} task id: ${taskDic[file.Key]}.`
          );
        });
        if (data.Errors) {
          data.Errors.forEach((file) => {
            logger.error(
              `failed to delete file: ${file.Key} task id: ${
                taskDic[file.Key]
              }, ${file.Code}`
            );
          });
        }
      }
      resolve(Array.from(deleted));
    });
  });
}

async function deleteBatch(batchSize, offset) {
  const files = await getExpiredBatch(batchSize, offset);
  if (files.length === 0) {
    return true;
  }
  let deleted = [];
  const invalidEngineMessage =
    `invalid storage engine selected: ${config.get('storageEngine')} \n` +
    'supported engines: S3 , FS';
  switch (config.get('storageEngine').toUpperCase()) {
    case 'FS':
      deleted = await deleteFilesFS(files);
      break;
    case 'S3':
      deleted = await deleteFilesS3(files);
      break;
    default:
      logger.error(invalidEngineMessage);
      return Promise.reject(
        exception(`invalid storage engine: ${config.get('storageEngine')}`)
      );
  }
  deleteFromDb(deleted);
  return files.length !== batchSize;
}

async function main() {
  const batchSize = config.get('batchSize');
  let offset = 0;
  let done = false;
  do {
    try {
      done = await deleteBatch(batchSize, offset);
    } catch (err) {
      return Promise.reject(err);
    }
    offset += batchSize;
  } while (!done);
}

try {
  main();
} catch (err) {
  logger.error(err.message);
  process.exit(1);
}
