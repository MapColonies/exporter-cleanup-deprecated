# Map Colonies storage cleanup worker
This is a worker of storage cleanup task.
when run it will removed all expired files from fs and all expired records from storage service.

### configurations:
The service configuration file can be created by running ```npm run confd``` or ```npm run confd:prod``. 
The generated values are taken from env if existent,

for dev deployments the configuration file can then be modified manually.

The configuration contains the following values:
- logger level: minimal severity level to save in log.
- dbServiceUrl: url of exporter request storage service endpoint.
- maxRetries: number of attempts to reach storage service before waiting for next schedule.
-  exportDirectory base directory for file storage.
-  batchSize: amount of records to retrieve and delete on every call to storage service.
