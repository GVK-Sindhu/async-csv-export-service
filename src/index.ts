import express from 'express';
import pool from './db';
import { v4 as uuidv4 } from 'uuid';
import { exportWorker } from './worker';
import fs from 'fs';
import path from 'path';
import compression from 'compression';

const app = express();
const port = process.env.API_PORT || 8080;
const storagePath = process.env.EXPORT_STORAGE_PATH || path.join(__dirname, '../exports');

// Ensure storage path exists
if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
}

app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Initiate Export
app.post('/exports/csv', async (req, res) => {
    const { country_code, subscription_tier, min_ltv, columns, delimiter = ',', quoteChar = '"' } = req.query;
    const exportId = uuidv4();

    const filters = {
        country_code: country_code as string,
        subscription_tier: subscription_tier as string,
        min_ltv: min_ltv ? parseFloat(min_ltv as string) : undefined,
    };

    try {
        await pool.query(
            `INSERT INTO exports (id, status, filters, columns, delimiter, quote_char) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [exportId, 'pending', JSON.stringify(filters), columns as string || null, delimiter, quoteChar]
        );

        // Offload to worker
        exportWorker.addJob(exportId);

        res.status(202).json({
            exportId,
            status: 'pending',
        });
    } catch (error) {
        console.error('Failed to initiate export:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Check Status
app.get('/exports/:exportId/status', async (req, res) => {
    const { exportId } = req.params;

    try {
        const result = await pool.query('SELECT * FROM exports WHERE id = $1', [exportId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Export not found' });
        }

        const job = result.rows[0];
        res.json({
            exportId: job.id,
            status: job.status,
            progress: {
                totalRows: job.total_rows,
                processedRows: job.processed_rows,
                percentage: job.total_rows > 0 ? Math.round((job.processed_rows / job.total_rows) * 100) : 0,
            },
            error: job.error_message || null,
            createdAt: job.created_at,
            completedAt: job.completed_at || null,
        });
    } catch (error) {
        console.error('Failed to get status:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Download File
app.get('/exports/:exportId/download', compression({
    filter: (req, res) => {
        // Only compress if the client accepts gzip and it's not a range request
        if (req.headers.range) {
            return false;
        }
        return compression.filter(req, res);
    }
}), async (req, res) => {
    const { exportId } = req.params;
    const filePath = path.join(storagePath, `export_${exportId}.csv`);

    try {
        const result = await pool.query('SELECT status FROM exports WHERE id = $1', [exportId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Export not found' });
        }

        const job = result.rows[0];
        if (job.status !== 'completed') {
            return res.status(425).json({ error: 'Export not yet completed' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Export file not found' });
        }

        const stats = fs.statSync(filePath);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="export_${exportId}.csv"`);
        res.setHeader('Accept-Ranges', 'bytes');

        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

            if (start >= stats.size) {
                res.status(416).setHeader('Content-Range', `bytes */${stats.size}`).send();
                return;
            }

            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                'Content-Length': chunksize,
            });
            file.pipe(res);
        } else {
            res.setHeader('Content-Length', stats.size);
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (error) {
        console.error('Failed to download export:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.delete('/exports/:exportId', async (req, res) => {
    const { exportId } = req.params;
    const filePath = path.join(storagePath, `export_${exportId}.csv`);

    try {
        const result = await pool.query('SELECT status FROM exports WHERE id = $1', [exportId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Export not found' });
        }

        // Cancel in worker if active
        exportWorker.cancelJob(exportId);

        // Update DB
        await pool.query(
            'UPDATE exports SET status = $1, completed_at = $2 WHERE id = $3',
            ['cancelled', new Date(), exportId]
        );

        // Clean up file if exists
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(204).send();
    } catch (error) {
        console.error('Failed to cancel export:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
