# Orders Microservice
```
docker compose up -d

```

## Dev pasos
1. Clonar proyecto
2. Crear archivo `.env` basado en el archivo `.env.template`
3. Levantar base de datos con `docker compose up -d`
4. Levantar servidor de Nats
```
docker run -d --name nats-server -p 4222:4222 -p 8222:8222 nats
```
5. Levantar el proyecto con `rpm run start:dev`