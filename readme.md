# Map Colonies storage cleanup worker
This is a worker of storage cleanup task.
when run it will removed all expired files from fs and all expired records from storage service.

### configurations:
The service configuration file can be created by running ```npm run confd``` or ```npm run confd:prod``. 
The generated values are taken from env if exists,
for dev deployments the configuration file can then be modified manually.

The configuration contains the following values:
- logger:
  - level: minimal severity level to save in log.
- db:
  - ServiceUrl: url of exporter request storage service endpoint.
  - maxRetries: number of attempts to reach storage service before waiting for next schedule.
-  batchSize: amount of records to retrieve and delete on every call to storage service.
- fileFormats: file extensions to try to delete.
- storageEngine: type of storage to use. supported values: FS , S3. 
-  fs:
   -  exportDirectory base directory for FS file storage.
-  s3:
   -  apiVersion: s3 api version.
   -  endpoint: s3 endpoint base url.
   -  accessKeyId: s3 access key.
   -  secretAccessKey: s3 secret token.
   -  maxRetries: max retries to reach s3.
   -  sslEnabled: should connection to s3 be encrypted with ssl.
   -  bucket: name of storage bucket with the file to delete.
### notes
  - In order for FS configuration to work the mounted directory must have write permissions on every exported file