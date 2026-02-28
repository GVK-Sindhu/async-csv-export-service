const API_URL = ''; // Relative to source

const startBtn = document.getElementById('start-export');
const jobsList = document.getElementById('jobs-list');
const jobCountBadge = document.getElementById('job-count');
const jobTemplate = document.getElementById('job-template');

let activeJobs = new Map();

async function initiateExport() {
    const country_code = document.getElementById('country_code').value;
    const subscription_tier = document.getElementById('subscription_tier').value;
    const min_ltv = document.getElementById('min_ltv').value;

    startBtn.classList.add('loading');
    startBtn.disabled = true;

    try {
        const queryParams = new URLSearchParams();
        if (country_code) queryParams.append('country_code', country_code);
        if (subscription_tier) queryParams.append('subscription_tier', subscription_tier);
        if (min_ltv) queryParams.append('min_ltv', min_ltv);

        const response = await fetch(`${API_URL}/exports/csv?${queryParams.toString()}`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to initiate export');

        const { exportId } = await response.json();
        addJobToUI(exportId);
        trackJob(exportId);
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        startBtn.classList.remove('loading');
        startBtn.disabled = false;
    }
}

function addJobToUI(id) {
    // Remove empty state if present
    const emptyState = jobsList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const clone = jobTemplate.content.cloneNode(true);
    const container = clone.querySelector('.job-card');
    container.id = `job-${id}`;

    container.querySelector('.job-id').textContent += id.substring(0, 8) + '...';

    // Wire up cancel button
    container.querySelector('.btn-cancel').onclick = () => cancelJob(id);

    jobsList.prepend(clone);
    updateJobCount();
}

async function trackJob(id) {
    if (activeJobs.has(id)) return;

    const poll = async () => {
        try {
            const response = await fetch(`${API_URL}/exports/${id}/status`);
            if (!response.ok) throw new Error('Job not found');

            const data = await response.json();
            updateJobUI(id, data);

            if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
                activeJobs.delete(id);
                return;
            }

            // Continue polling
            activeJobs.set(id, setTimeout(poll, 2000));
        } catch (error) {
            console.error('Polling error:', error);
            activeJobs.delete(id);
        }
    };

    activeJobs.set(id, true);
    poll();
}

function updateJobUI(id, data) {
    const card = document.getElementById(`job-${id}`);
    if (!card) return;

    const statusBadge = card.querySelector('.job-status-badge');
    statusBadge.textContent = data.status;
    statusBadge.className = `job-status-badge ${data.status}`;

    const progressText = card.querySelector('.progress-text');
    const progressBar = card.querySelector('.progress-bar-fill');
    const processedRows = card.querySelector('.processed-rows');

    const percentage = data.progress.percentage || 0;
    progressText.textContent = `${percentage}%`;
    progressBar.style.width = `${percentage}%`;
    processedRows.textContent = `${data.progress.processedRows.toLocaleString()} / ${data.progress.totalRows.toLocaleString()} rows`;

    if (data.status === 'completed') {
        const downloadBtn = card.querySelector('.btn-download');
        downloadBtn.href = `${API_URL}/exports/${id}/download`;
        downloadBtn.classList.remove('hidden');
        card.querySelector('.btn-cancel').classList.add('hidden');
    }

    if (data.status === 'failed' && data.error) {
        const errorDiv = card.querySelector('.job-error');
        errorDiv.textContent = `Error: ${data.error}`;
        errorDiv.classList.remove('hidden');
    }
}

async function cancelJob(id) {
    if (!confirm('Are you sure you want to cancel this export?')) return;

    try {
        const response = await fetch(`${API_URL}/exports/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Force status check to update UI quickly
            clearTimeout(activeJobs.get(id));
            trackJob(id);
        }
    } catch (error) {
        alert('Failed to cancel job');
    }
}

function updateJobCount() {
    const cards = jobsList.querySelectorAll('.job-card').length;
    jobCountBadge.textContent = cards;
}

startBtn.addEventListener('click', initiateExport);
