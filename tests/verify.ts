import axios from 'axios';

const API_URL = 'http://localhost:8080';

async function runTests() {
    console.log('Starting verification tests...');

    try {
        // 1. Health Check
        console.log('Testing /health...');
        const health = await axios.get(`${API_URL}/health`);
        console.log('Health:', health.data);

        // 2. Initiate Export
        console.log('Testing /exports/csv...');
        const initiate = await axios.post(`${API_URL}/exports/csv?columns=id,email,country_code&delimiter=|`);
        const { exportId } = initiate.data;
        console.log('Initiated Export ID:', exportId);

        // 3. Check Status
        console.log('Polling status...');
        let status = '';
        let progress = 0;
        while (status !== 'completed' && status !== 'failed') {
            const res = await axios.get(`${API_URL}/exports/${exportId}/status`);
            status = res.data.status;
            progress = res.data.progress.percentage;
            console.log(`Status: ${status} (${progress}%)`);
            if (status === 'completed' || status === 'failed') break;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (status === 'failed') {
            throw new Error('Export failed');
        }

        // 4. Download and Verify
        console.log('Testing /download...');
        const download = await axios.get(`${API_URL}/exports/${exportId}/download`, {
            headers: { 'Accept-Encoding': 'gzip' }
        });
        console.log('Download Headers:', download.headers);
        console.log('First 100 bytes of data:', download.data.substring(0, 100));

        // 5. Test Partial Download (Range)
        console.log('Testing Range request...');
        const range = await axios.get(`${API_URL}/exports/${exportId}/download`, {
            headers: { 'Range': 'bytes=0-1023' }
        });
        console.log('Range Headers:', range.headers);
        console.log('Range Status:', range.status);

        console.log('Verification tests passed!');
    } catch (error: any) {
        console.error('Test failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

runTests();
