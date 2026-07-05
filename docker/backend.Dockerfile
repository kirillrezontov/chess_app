FROM golang:1.22-alpine AS build
WORKDIR /src
COPY backend/go.mod ./
RUN go mod download || true
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=build /out/server /usr/local/bin/server
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/server"]
