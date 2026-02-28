import axios from 'axios';

const API_URL = 'http://localhost:8080';

async function testCancellation() {
    console.log('Testing cancellation...');
    try {
        const initiate = await axios.post(`${API_URL}/exports/csv`);
        const { exportId } = initiate.data;
        console.log('Initiated Export ID for cancellation:', exportId);

        // Wait a brief moment to ensure it starts
        await new Promise(r => setTimeout(r, 2000));

        // Cancel
        console.log('Cancelling job...');
        const cancel = await axios.delete(`${API_URL}/exports/${exportId}`);
        console.log('Cancel Status:', cancel.status);

        // Check status
        const statusRes = await axios.get(`${API_URL}/exports/${exportId}/status`);
        console.log('Final Status (should be cancelled):', statusRes.data.status);

        if (statusRes.data.status !== 'cancelled') {
            throw new Error(`Expected cancelled but got ${statusRes.data.status}`);
        }

        console.log('Cancellation test passed!');
    } catch (error: any) {
        console.error('Cancellation test failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

testCancellation();
