/* ========================================
   SmearLab — Frontend Controller
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadContent = dropZone.querySelector('.upload-content');
    const uploadPreview = document.getElementById('uploadPreview');
    const previewImg = document.getElementById('previewImg');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const cancelPreviewBtn = document.getElementById('cancelPreviewBtn');
    const loadingSection = document.getElementById('loadingSection');
    const loaderProgressBar = document.getElementById('loaderProgressBar');
    const resultsSection = document.getElementById('resultsSection');
    const resetBtn = document.getElementById('resetBtn');
    const sampleCards = document.querySelectorAll('.sample-card');

    let currentFile = null;
    let progressInterval = null;

    // ========================================
    // Toast System
    // ========================================
    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const iconMap = {
            success: 'check-circle',
            error: 'alert-circle',
            info: 'info'
        };

        toast.innerHTML = `
            <i data-lucide="${iconMap[type]}" class="toast-icon"></i>
            <span class="toast-message">${escapeHtml(message)}</span>
            <button class="toast-close"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
        `;

        container.appendChild(toast);
        lucide.createIcons({ nodes: [toast] });

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => dismissToast(toast));

        if (duration > 0) {
            setTimeout(() => dismissToast(toast), duration);
        }
    }

    function dismissToast(toast) {
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove());
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========================================
    // Drag & Drop
    // ========================================
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFileSelect, false);
    resetBtn.addEventListener('click', resetUI, false);
    cancelPreviewBtn.addEventListener('click', cancelPreview, false);
    analyzeBtn.addEventListener('click', () => {
        if (currentFile) sendFile(currentFile);
    });

    // ========================================
    // Sample Gallery Click
    // ========================================
    sampleCards.forEach(card => {
        card.addEventListener('click', () => {
            const filename = card.dataset.sample;
            fetchSampleAndAnalyze(filename);
        });
    });

    async function fetchSampleAndAnalyze(filename) {
        try {
            showLoading();
            const response = await fetch(`/sample/${filename}`);
            if (!response.ok) throw new Error('Failed to load sample');

            const blob = await response.blob();
            const file = new File([blob], filename, { type: blob.type });
            currentFile = file;
            sendFile(file);
        } catch (err) {
            console.error(err);
            showToast('Failed to load sample image', 'error');
            resetUI();
        }
    }

    // ========================================
    // File Handling
    // ========================================
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) processFile(files[0]);
    }

    function handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) processFile(files[0]);
    }

    function processFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('Please upload a valid image file (JPG or PNG)', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showToast('File too large. Maximum size is 10MB.', 'error');
            return;
        }

        currentFile = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            uploadContent.classList.add('hidden');
            uploadPreview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    function cancelPreview() {
        currentFile = null;
        fileInput.value = '';
        uploadPreview.classList.add('hidden');
        uploadContent.classList.remove('hidden');
    }

    // ========================================
    // Loading & Progress
    // ========================================
    function showLoading() {
        uploadPreview.classList.add('hidden');
        uploadContent.classList.add('hidden');
        loadingSection.classList.remove('hidden');
        loaderProgressBar.style.width = '0%';

        // Simulate progress
        let progress = 0;
        clearInterval(progressInterval);
        progressInterval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 90) progress = 90;
            loaderProgressBar.style.width = `${progress}%`;
        }, 200);
    }

    function hideLoading() {
        clearInterval(progressInterval);
        loaderProgressBar.style.width = '100%';
        setTimeout(() => {
            loadingSection.classList.add('hidden');
        }, 300);
    }

    // ========================================
    // Upload & Predict
    // ========================================
    function sendFile(file) {
        showLoading();

        const formData = new FormData();
        formData.append('file', file);

        fetch('/predict', {
            method: 'POST',
            body: formData
        })
        .then(async response => {
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `Server error: ${response.status}`);
            }
            if (data.error) throw new Error(data.error);
            return data;
        })
        .then(data => {
            hideLoading();
            displayResults(data);
        })
        .catch(error => {
            console.error('Error:', error);
            hideLoading();
            showToast(error.message || 'Failed to analyze image. Please try again.', 'error');
            resetUI();
        });
    }

    // ========================================
    // Display Results
    // ========================================
    function displayResults(data) {
        resultsSection.classList.remove('hidden');
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Status Badge
        const badge = document.getElementById('statusBadge');
        badge.className = 'status-badge';

        let iconHtml = '';
        let explanation = '';

        if (data.label === 'Good Smear') {
            badge.classList.add('status-good');
            iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            explanation = 'The model identified this as a <strong>good quality smear</strong> with sufficient clarity, contrast, and cell distribution for reliable analysis.';
        } else if (data.label === 'Bad Smear') {
            badge.classList.add('status-bad');
            iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
            explanation = 'The model classified this as a <strong>low quality smear</strong>. Issues may include blurriness, poor staining, uneven illumination, or insufficient cell density.';
        } else {
            badge.classList.add('status-uncertain');
            iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
            explanation = 'The model is <strong>uncertain</strong> about this smear. The confidence score is below threshold. Consider retaking or improving slide preparation.';
        }

        badge.innerHTML = `${iconHtml} ${escapeHtml(data.label)}`;

        // Confidence
        const confidencePercent = Math.min((data.confidence * 100), 100).toFixed(1);
        document.getElementById('confidenceValue').textContent = `${confidencePercent}%`;

        // Animate progress bar after a small delay
        const progressBar = document.getElementById('confidenceBar');
        progressBar.style.width = '0%';
        requestAnimationFrame(() => {
            setTimeout(() => {
                progressBar.style.width = `${confidencePercent}%`;
            }, 100);
        });

        // Explanation
        document.getElementById('predictionExplanation').innerHTML = explanation;

        // Images
        document.getElementById('originalImage').src = `data:image/jpeg;base64,${data.original_image}`;
        document.getElementById('gradcamImage').src = `data:image/jpeg;base64,${data.gradcam_image}`;
    }

    // ========================================
    // Reset UI
    // ========================================
    function resetUI() {
        currentFile = null;
        fileInput.value = '';
        document.getElementById('confidenceBar').style.width = '0%';
        resultsSection.classList.add('hidden');
        loadingSection.classList.add('hidden');
        uploadPreview.classList.add('hidden');
        uploadContent.classList.remove('hidden');
        dropZone.classList.remove('dragover');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ========================================
    // Keyboard Shortcuts
    // ========================================
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !resultsSection.classList.contains('hidden')) {
            resetUI();
        }
    });

    // ========================================
    // Intersection Observer for scroll animations
    // ========================================
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.sample-gallery-section, .upload-section, .how-it-works, .technical-section').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(16px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Initial reveal for hero
    document.querySelector('.hero').style.opacity = '1';
});
