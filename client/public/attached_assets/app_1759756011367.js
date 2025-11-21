// ClipCraft - Frontend JavaScript
class ClipCraft {
    constructor() {
        this.sourceType = 'youtube';
        this.selectedFile = null;
        this.aspectRatio = '9:16';
        this.sessionId = null;
        this.clips = [];
        
        this.initElements();
        this.bindEvents();
    }

    initElements() {
        // Input elements
        this.sourceToggle = document.querySelectorAll('.toggle-btn');
        this.youtubeInput = document.getElementById('youtube-input');
        this.fileInput = document.getElementById('file-input');
        this.youtubeUrl = document.getElementById('youtube-url');
        this.videoFile = document.getElementById('video-file');
        this.dropZone = document.getElementById('drop-zone');
        this.filePreview = document.getElementById('file-preview');
        this.fileName = document.getElementById('file-name');
        this.removeFileBtn = document.getElementById('remove-file');

        // Settings elements
        this.clipDuration = document.getElementById('clip-duration');
        this.numClips = document.getElementById('num-clips');
        this.aspectBtns = document.querySelectorAll('.aspect-btn');
        this.resolution = document.getElementById('resolution');
        
        // Custom prompt elements
        this.customPrompt = document.getElementById('custom-prompt');
        this.clearPromptBtn = document.getElementById('clear-prompt');
        this.promptExamples = document.querySelectorAll('.prompt-example');

        // Action elements
        this.generateBtn = document.getElementById('generate-btn');
        this.downloadAllBtn = document.getElementById('download-all-btn');
        this.createNewBtn = document.getElementById('create-new-btn');

        // Progress elements
        this.progressSection = document.getElementById('progress-section');
        this.progressFill = document.getElementById('progress-fill');
        this.progressStatus = document.getElementById('progress-status');
        this.progressSteps = document.querySelectorAll('.step');

        // Results elements
        this.resultsSection = document.getElementById('results-section');
        this.clipsGrid = document.getElementById('clips-grid');

        // Error elements
        this.errorMessage = document.getElementById('error-message');
        this.errorText = document.getElementById('error-text');
        this.closeError = document.getElementById('close-error');

        // Loading overlay
        this.loadingOverlay = document.getElementById('loading-overlay');
    }

    bindEvents() {
        // Source toggle
        this.sourceToggle.forEach(btn => {
            btn.addEventListener('click', () => this.handleSourceToggle(btn));
        });

        // File upload
        this.dropZone.addEventListener('click', () => this.videoFile.click());
        this.videoFile.addEventListener('change', (e) => this.handleFileSelect(e));
        this.removeFileBtn.addEventListener('click', () => this.removeFile());

        // Drag and drop
        this.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.dropZone.addEventListener('dragleave', () => this.handleDragLeave());
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));

        // Aspect ratio buttons
        this.aspectBtns.forEach(btn => {
            btn.addEventListener('click', () => this.handleAspectRatio(btn));
        });
        
        // Custom prompt handlers
        this.promptExamples.forEach(btn => {
            btn.addEventListener('click', () => {
                this.customPrompt.value = btn.dataset.prompt;
                this.customPrompt.focus();
            });
        });
        
        this.clearPromptBtn?.addEventListener('click', () => {
            this.customPrompt.value = '';
            this.customPrompt.focus();
        });

        // Action buttons
        this.generateBtn.addEventListener('click', () => this.generateClips());
        this.downloadAllBtn?.addEventListener('click', () => this.downloadAll());
        this.createNewBtn?.addEventListener('click', () => this.resetApp());

        // Error close
        this.closeError?.addEventListener('click', () => this.hideError());
    }

    handleSourceToggle(btn) {
        this.sourceToggle.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        this.sourceType = btn.dataset.source;
        
        if (this.sourceType === 'youtube') {
            this.youtubeInput.classList.remove('hidden');
            this.fileInput.classList.add('hidden');
        } else {
            this.youtubeInput.classList.add('hidden');
            this.fileInput.classList.remove('hidden');
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file && this.validateFile(file)) {
            this.selectedFile = file;
            this.showFilePreview(file);
        }
    }

    validateFile(file) {
        const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
        const maxSize = 500 * 1024 * 1024; // 500MB

        if (!validTypes.includes(file.type)) {
            this.showError('Invalid file type. Please upload MP4, MOV, or WebM files.');
            return false;
        }

        if (file.size > maxSize) {
            this.showError('File too large. Maximum size is 500MB.');
            return false;
        }

        return true;
    }

    showFilePreview(file) {
        this.fileName.textContent = file.name;
        this.dropZone.classList.add('hidden');
        this.filePreview.classList.remove('hidden');
    }

    removeFile() {
        this.selectedFile = null;
        this.videoFile.value = '';
        this.dropZone.classList.remove('hidden');
        this.filePreview.classList.add('hidden');
    }

    handleDragOver(e) {
        e.preventDefault();
        this.dropZone.classList.add('dragover');
    }

    handleDragLeave() {
        this.dropZone.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.dropZone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (this.validateFile(file)) {
                this.selectedFile = file;
                this.showFilePreview(file);
                this.videoFile.files = files;
            }
        }
    }

    handleAspectRatio(btn) {
        this.aspectBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.aspectRatio = btn.dataset.ratio;
    }

    async generateClips() {
        // Validate input
        if (this.sourceType === 'youtube') {
            const url = this.youtubeUrl.value.trim();
            if (!url) {
                this.showError('Please enter a YouTube URL');
                return;
            }
            if (!this.validateYouTubeUrl(url)) {
                this.showError('Please enter a valid YouTube URL');
                return;
            }
        } else {
            if (!this.selectedFile) {
                this.showError('Please select a video file');
                return;
            }
        }

        // Show progress
        this.showProgress();

        // Prepare form data
        const formData = new FormData();
        
        if (this.sourceType === 'youtube') {
            formData.append('source_type', 'youtube');
            formData.append('youtube_url', this.youtubeUrl.value.trim());
        } else {
            formData.append('source_type', 'upload');
            formData.append('video_file', this.selectedFile);
        }
        
        formData.append('clip_duration', this.clipDuration.value);
        formData.append('num_clips', this.numClips.value);
        formData.append('aspect_ratio', this.aspectRatio);
        formData.append('resolution', this.resolution.value);
        formData.append('custom_prompt', this.customPrompt.value.trim());

        try {
            // Update progress
            this.updateProgress(25, 'Analyzing video with AI...');
            this.activateStep(1);

            // Send request
            const response = await this.sendRequest(formData);

            if (response.success) {
                this.sessionId = response.session_id;
                this.clips = response.clips;
                
                // Update progress
                this.updateProgress(100, 'Complete!');
                this.activateStep(4);

                // Show results after a short delay
                setTimeout(() => {
                    this.hideProgress();
                    this.showResults();
                }, 1500);
            } else {
                throw new Error(response.error || 'Processing failed');
            }
        } catch (error) {
            console.error('Error:', error);
            this.hideProgress();
            this.showError(error.message || 'An error occurred while processing your video');
        }
    }

    async sendRequest(formData) {
        let endpoint = '/process';
        let options = {};

        // Different handling for YouTube vs upload
        if (formData.get('source_type') === 'youtube') {
            // For YouTube, send as JSON
            const data = {
                source_type: 'youtube',
                youtube_url: formData.get('youtube_url'),
                clip_duration: formData.get('clip_duration'),
                num_clips: formData.get('num_clips'),
                aspect_ratio: formData.get('aspect_ratio'),
                resolution: formData.get('resolution'),
                custom_prompt: formData.get('custom_prompt')
            };

            options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            };
        } else {
            // For file upload, use FormData
            options = {
                method: 'POST',
                body: formData
            };
        }

        // Simulate progress updates
        this.progressInterval = setInterval(() => {
            const current = parseInt(this.progressFill.style.width) || 25;
            if (current < 90) {
                const next = Math.min(current + 10, 90);
                this.updateProgress(next, this.getProgressMessage(next));
                this.activateStepByProgress(next);
            }
        }, 3000);

        try {
            const response = await fetch(endpoint, options);
            clearInterval(this.progressInterval);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            clearInterval(this.progressInterval);
            throw error;
        }
    }

    getProgressMessage(progress) {
        if (progress < 40) return 'Analyzing video with AI...';
        if (progress < 60) return 'Extracting clips...';
        if (progress < 80) return 'Formatting videos...';
        return 'Finalizing...';
    }

    activateStepByProgress(progress) {
        if (progress >= 25) this.activateStep(1);
        if (progress >= 50) this.activateStep(2);
        if (progress >= 75) this.activateStep(3);
        if (progress >= 90) this.activateStep(4);
    }

    activateStep(stepNum) {
        for (let i = 0; i < stepNum; i++) {
            this.progressSteps[i]?.classList.add('active');
        }
    }

    updateProgress(percent, message) {
        this.progressFill.style.width = `${percent}%`;
        this.progressStatus.textContent = message;
    }

    showProgress() {
        this.progressSection.classList.remove('hidden');
        this.resultsSection.classList.add('hidden');
        this.errorMessage.classList.add('hidden');
        
        // Reset progress
        this.progressFill.style.width = '0%';
        this.progressSteps.forEach(step => step.classList.remove('active'));
    }

    hideProgress() {
        this.progressSection.classList.add('hidden');
    }

    showResults() {
        this.resultsSection.classList.remove('hidden');
        this.renderClips();
        
        // Set download all button
        if (this.downloadAllBtn) {
            this.downloadAllBtn.onclick = () => this.downloadAll();
        }
    }

    renderClips() {
        this.clipsGrid.innerHTML = '';
        
        this.clips.forEach((clip, index) => {
            const clipCard = document.createElement('div');
            clipCard.className = 'clip-card';
            clipCard.innerHTML = `
                <video class="clip-preview" controls>
                    <source src="${clip.path}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                <div class="clip-info">
                    <h3 class="clip-title">Clip ${index + 1}</h3>
                    <p class="clip-description">${clip.description}</p>
                    <p class="clip-time">${clip.start_time} - ${clip.end_time}</p>
                </div>
                <div class="clip-actions">
                    <button class="clip-btn download-btn" onclick="window.clipcraft.downloadClip('${clip.path}', '${clip.filename}')">
                        <i class="fas fa-download"></i>
                        Download
                    </button>
                </div>
            `;
            this.clipsGrid.appendChild(clipCard);
        });
    }

    downloadClip(path, filename) {
        const link = document.createElement('a');
        link.href = path;
        link.download = filename;
        link.click();
    }

    downloadAll() {
        if (this.sessionId) {
            window.location.href = `/download_all/${this.sessionId}`;
        }
    }

    resetApp() {
        // Reset form
        this.youtubeUrl.value = '';
        this.customPrompt.value = '';
        this.removeFile();
        
        // Reset sections
        this.progressSection.classList.add('hidden');
        this.resultsSection.classList.add('hidden');
        this.errorMessage.classList.add('hidden');
        
        // Reset data
        this.sessionId = null;
        this.clips = [];
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    validateYouTubeUrl(url) {
        const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
        return pattern.test(url);
    }

    showError(message) {
        this.errorText.textContent = message;
        this.errorMessage.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => this.hideError(), 5000);
    }

    hideError() {
        this.errorMessage.classList.add('hidden');
    }
}

// Initialize app
window.clipcraft = new ClipCraft();

// Add smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to generate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        window.clipcraft.generateClips();
    }
    
    // Escape to close error
    if (e.key === 'Escape') {
        window.clipcraft.hideError();
    }
});

// Prevent form submission on Enter
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
    }
});

// Add loading states to buttons
document.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', function() {
        if (this.classList.contains('generate-btn')) {
            this.disabled = true;
            setTimeout(() => {
                this.disabled = false;
            }, 2000);
        }
    });
});
