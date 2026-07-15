FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git pandoc weasyprint && rm -rf /var/lib/apt/lists/*
RUN (getent group 1000 >/dev/null || groupadd -g 1000 spring) \
 && (getent passwd 1000 >/dev/null || useradd -u 1000 -g 1000 spring)
COPY --from=build /workspace/target/dps-wiki-llm-backend-*.jar app.jar
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
