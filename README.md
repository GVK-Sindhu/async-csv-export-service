# CSV Data Export Service

A scalable data export service that streams millions of database rows to CSV files asynchronously, handling backpressure and memory constraints.

## Features
- **Asynchronous Streaming**: Streams data directly from PostgreSQL to CSV using database cursors.
- **Memory Efficient**: Optimized to run within a 150MB RAM limit, even for 10M+ row exports.
- **Backpressure Handling**: Respects slow clients and disk I/O using native Node.js streams.
- **Job Management**: Asynchronous job initiation with progress tracking.
- **Custom Formatting**: Support for custom delimiters, quote characters, and column selection.
- **Advanced Networking**: Supports gzip compression and resumable downloads (Byte Range requests).

## Tech Stack
- **Runtime**: Node.js (TypeScript)
- **Database**: PostgreSQL 15
- **Concurrency**: Built-in worker pool for job management.
- **Streaming**: `pg-query-stream` and `fast-csv`.

## Prerequisites
- Docker & Docker Compose

## Getting Started

1. Clone the repository.
2. Create a `.env` file from `.env.example`.
3. Start the services:
   ```bash
   docker-compose up --build
   ```

The database will automatically seed with 10 million user records upon startup.

## API Endpoints

### POST /exports/csv
Initiates a new CSV export job.
- **Query Params**:
  - `country_code`: Filter by country.
  - `subscription_tier`: Filter by tier.
  - `min_ltv`: Minimum lifetime value filter.
  - `columns`: Comma-separated list of columns.
  - `delimiter`: Custom delimiter (default: `,`).
  - `quoteChar`: Custom quote character (default: `"`).
- **Response**: `202 Accepted` with `exportId`.

### GET /exports/{exportId}/status
Checks the status of an export job.

### GET /exports/{exportId}/download
Downloads the generated CSV file. Supports `Accept-Encoding: gzip` and `Range` headers.

### DELETE /exports/{exportId}
Gracefully cancels an in-progress export and cleans up resources.

### GET /health
Health check endpoint.

## Architecture
The service utilizes a worker-pool pattern where API requests are immediately acknowledged with a `202 Accepted` status. A background worker picks up jobs and uses database cursors to fetch data in small batches, piping the result through a transformation stream (CSV formatter) directly to the filesystem. This ensures that memory usage remains constant regardless of the total dataset size.
