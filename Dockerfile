# Servidor de Ringfall (juego + multijugador + cuentas) en un contenedor. Sin dependencias.
# Las cuentas se guardan en /data: monta ahí un volumen persistente para no perderlas al reiniciar.
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=8080 RINGFALL_DATA=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "server/index.js"]
