FROM node:12.18.3-slim as node-base
RUN apt-get update && apt-get -y install wget
RUN mkdir /confd
RUN wget -O '/confd/confd' 'https://github.com/kelseyhightower/confd/releases/download/v0.15.0/confd-0.15.0-linux-amd64'
RUN chmod +x /confd/confd

FROM node-base as production
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
WORKDIR /usr/app
RUN mkdir ./confd && cp /confd/confd ./confd/confd
COPY ./run.sh ./run.sh
RUN chmod +x run.sh
COPY ./package*.json ./
RUN npm install --only=production
COPY . .

CMD ["./run.sh"]
