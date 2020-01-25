################################################################################
# Stage 1 : Prepare the target image with pm2
################################################################################

FROM andrewmackrodt/nodejs:12 AS target

RUN npm install -g pm2

################################################################################
# Stage 2 : Install dependencies
################################################################################

FROM andrewmackrodt/nodejs:12 AS cache

# copy package.json to make use of docker cache layers
# assuming package.json has not changed
COPY --chown=ubuntu:ubuntu package*.json /opt/app/

WORKDIR /opt/app

# install npm dependencies
RUN mkdir build \
  && cp package*.json build/ \
  && cd build \
  && npm ci --only=prod \
  && cd .. \
  && npm ci

# copy the rest of the project
COPY --chown=ubuntu:ubuntu . /opt/app

################################################################################
# Stage 3 : Create the dist bundle
################################################################################

FROM cache AS build

RUN make dist

################################################################################
# Stage 4 : Copy the dist bundle
################################################################################

FROM target

COPY --from=build /opt/app/build /opt/app

COPY pm2.json /opt/app/pm2.json

WORKDIR /opt/app

# default NODE_ENV to production
ENV NODE_ENV "production"

# use pm2 to run the application
ENV ENTRYPOINT0="pm2-runtime start /opt/app/pm2.json"

# export storage as a volume
VOLUME /opt/app/storage
