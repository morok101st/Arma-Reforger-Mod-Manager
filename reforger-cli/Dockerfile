FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV REFORGER_INSTALL_DIR=/opt/reforger-server
ENV HOME=/opt/reforger-server
ENV STEAMCMD_DIR=/opt/reforger-server/steamcmd
ENV SRCDS_APPID=1874900
ENV REFORGER_METADATA_PORT=8081
ENV REFORGER_METADATA_TIMEOUT_SECONDS=180
ENV REFORGER_METADATA_SETTLE_SECONDS=8
ENV REFORGER_METADATA_POLL_SECONDS=0.5
ENV REFORGER_UPDATE_TIMEOUT_SECONDS=600
ENV REFORGER_UPDATE_ON_START=true
ENV REFORGER_KEEP_WORKDIR=false
ENV REFORGER_WORKDIR=/tmp

RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        tar \
        procps \
        python3 \
        lib32gcc-s1 \
        lib32stdc++6 \
        libcurl4 \
        libcurl4:i386 \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/reforger-entrypoint
COPY metadata_service.py /usr/local/bin/reforger-metadata-service
RUN chmod +x /usr/local/bin/reforger-entrypoint /usr/local/bin/reforger-metadata-service

VOLUME ["/opt/reforger-server"]
EXPOSE 8081

CMD ["/usr/local/bin/reforger-entrypoint"]
