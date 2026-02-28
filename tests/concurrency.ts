import axios from 'axios';

const API_URL = 'http://localhost:8080';

async function testConcurrency() {
    console.log('Testing concurrency (3 jobs)...');
    try {
        const jobs = await Promise.all([
            axios.post(`${API_URL}/exports/csv`),
            axios.post(`${API_URL}/exports/csv`),
            axios.post(`${API_URL}/exports/csv`)
        ]);

        const exportIds = jobs.map(j => j.data.exportId);
        console.log('Spawned jobs:', exportIds);

        let allCompleted = false;
        while (!allCompleted) {
            const statuses = await Promise.all(exportIds.map(id => axios.get(`${API_URL}/exports/${id}/status`)));
            const states = statuses.map(s => s.data.status);
            console.log('Statuses:', states);

            if (states.every(s => s === 'completed')) {
                allCompleted = true;
            } else if (states.some(s => s === 'failed')) {
                throw new Error('One or more jobs failed');
            } else {
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        console.log('Concurrency test passed!');
    } catch (error: any) {
        console.error('Concurrency test failed:', error.message);
        process.exit(1);
    }
}

testConcurrency();
