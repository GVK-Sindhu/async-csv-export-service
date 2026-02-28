import pool from './db';
import QueryStream from 'pg-query-stream';
import { format } from 'fast-csv';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

const storagePath = process.env.EXPORT_STORAGE_PATH || path.join(__dirname, '../exports');

class ExportWorker {
    private activeJobs = new Set<string>();
    private queue: string[] = [];
    private isProcessing = false;
    private maxConcurrent = 3; // Requirement says handle at least 3 concurrent export jobs
    private workersRunning = 0;

    addJob(exportId: string) {
        this.queue.push(exportId);
        this.processQueue();
    }

    cancelJob(exportId: string) {
        this.activeJobs.delete(exportId);
    }

    private async processQueue() {
        if (this.workersRunning >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        const exportId = this.queue.shift();
        if (!exportId) return;

        this.workersRunning++;
        this.activeJobs.add(exportId);

        try {
            await this.runExport(exportId);
        } catch (error) {
            console.error(`Export ${exportId} failed:`, error);
        } finally {
            this.activeJobs.delete(exportId);
            this.workersRunning--;
            this.processQueue();
        }
    }

    private async runExport(exportId: string) {
        const client = await pool.connect();
        const filePath = path.join(storagePath, `export_${exportId}.csv`);

        try {
            const jobResult = await pool.query('SELECT * FROM exports WHERE id = $1', [exportId]);
            if (jobResult.rows.length === 0) return;
            const job = jobResult.rows[0];

            // Update status to processing
            await pool.query('UPDATE exports SET status = $1 WHERE id = $2', ['processing', exportId]);

            const filters = job.filters || {};
            const whereClauses: string[] = [];
            const queryValues: any[] = [];

            if (filters.country_code) {
                whereClauses.push(`country_code = $${queryValues.length + 1}`);
                queryValues.push(filters.country_code);
            }
            if (filters.subscription_tier) {
                whereClauses.push(`subscription_tier = $${queryValues.length + 1}`);
                queryValues.push(filters.subscription_tier);
            }
            if (filters.min_ltv) {
                whereClauses.push(`lifetime_value >= $${queryValues.length + 1}`);
                queryValues.push(filters.min_ltv);
            }

            const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            // Get total count first for progress
            const countResult = await client.query(`SELECT COUNT(*) FROM users ${whereStr}`, queryValues);
            const totalRows = parseInt(countResult.rows[0].count, 10);
            await pool.query('UPDATE exports SET total_rows = $1 WHERE id = $2', [totalRows, exportId]);

            // Select columns
            const selectedColumns = job.columns ? job.columns.split(',').map((c: string) => c.trim()) : ['id', 'name', 'email', 'signup_date', 'country_code', 'subscription_tier', 'lifetime_value'];
            const selectStr = selectedColumns.join(', ');

            const queryStr = `SELECT ${selectStr} FROM users ${whereStr}`;
            const query = new QueryStream(queryStr, queryValues, { batchSize: 1000 });
            const stream = client.query(query);

            const writeStream = fs.createWriteStream(filePath);
            const csvStream = format({
                headers: true,
                delimiter: job.delimiter || ',',
                quote: job.quote_char || '"',
            });

            let processedRows = 0;
            const progressInterval = 10000;

            const progressTracker = new Transform({
                objectMode: true,
                transform: (chunk, encoding, callback) => {
                    if (!this.activeJobs.has(exportId)) {
                        callback(new Error('CANCELLED'));
                        return;
                    }

                    processedRows++;
                    if (processedRows % progressInterval === 0) {
                        pool.query('UPDATE exports SET processed_rows = $1 WHERE id = $2', [processedRows, exportId]).catch(console.error);
                    }
                    callback(null, chunk);
                }
            });

            try {
                await pipeline(stream, progressTracker, csvStream, writeStream);
            } catch (err: any) {
                if (err.message === 'CANCELLED') {
                    return;
                }
                throw err;
            }

            // Final update
            if (this.activeJobs.has(exportId)) {
                await pool.query(
                    'UPDATE exports SET status = $1, processed_rows = $2, completed_at = $3 WHERE id = $4',
                    ['completed', processedRows, new Date(), exportId]
                );
            }
        } catch (error: any) {
            if (this.activeJobs.has(exportId)) {
                await pool.query(
                    'UPDATE exports SET status = $1, error_message = $2, completed_at = $3 WHERE id = $4',
                    ['failed', error.message, new Date(), exportId]
                );
            }
            // Clean up file on failure
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            throw error;
        } finally {
            client.release();
        }
    }
}

export const exportWorker = new ExportWorker();
