const API_KEY = 'AIzaSyBs8VIj2Y0smjU4OtJDPFUBVV1mmHOWYgQ'; // Updated API key
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';
const fallbackData = {
    identify: [
        { name: "Sunflower (Helianthus annuus)", characteristics: "Tall annual with large yellow flower heads" },
        { name: "Rose (Rosa spp.)", characteristics: "Woody perennial with fragrant flowers in various colors" },
        { name: "Lavender (Lavandula)", characteristics: "Aromatic shrub with purple flower spikes" },
        { name: "Tulip (Tulipa)", characteristics: "Spring-blooming bulbous plant with cup-shaped flowers" },
        { name: "Orchid (Orchidaceae)", characteristics: "Diverse family of flowering plants with complex blooms" }
    ],
    diagnose: [
        { disease: "Powdery Mildew", symptoms: "White powdery spots on leaves", treatment: "Apply fungicide and improve air circulation" },
        { disease: "Aphid Infestation", symptoms: "Clusters of small insects on stems and leaves", treatment: "Use insecticidal soap or neem oil" },
        { disease: "Root Rot", symptoms: "Wilting, yellowing leaves and soft, brown roots", treatment: "Improve drainage and reduce watering" },
        { disease: "Leaf Spot", symptoms: "Brown or black spots on leaves", treatment: "Remove affected leaves and apply fungicide" },
        { disease: "Spider Mites", symptoms: "Tiny specks on leaves, fine webbing", treatment: "Increase humidity and use miticide if severe" }
    ]
};

const apiThrottle = {
    lastCallTime: 0,
    minInterval: 1000, // Minimum time between API calls in milliseconds
    async throttle() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;
        if (timeSinceLastCall < this.minInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
        }
        this.lastCallTime = Date.now();
    }
};

function openGallery(type) {
    document.getElementById(`${type}FileInput`).click();
}

function openCamera(type) {
    const cameraWindow = window.open('', '_blank', 'width=600,height=500');
    cameraWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Take Photo</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    background-color: #f0f0f0;
                    font-family: Arial, sans-serif;
                }
                .camera-container {
                    position: relative;
                    width: 100%;
                    max-width: 600px;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                #video {
                    width: 100%;
                    display: block;
                }
                #captureButton {
                    position: absolute;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: 12px 24px;
                    font-size: 18px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 30px;
                    cursor: pointer;
                    transition: background-color 0.3s ease;
                }
                #captureButton:hover {
                    background-color: #45a049;
                }
                .camera-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border: 2px solid #fff;
                    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
                    pointer-events: none;
                }
            </style>
        </head>
        <body>
            <div class="camera-container">
                <video id="video" autoplay playsinline></video>
                <div class="camera-overlay"></div>
                <button id="captureButton">Capture Photo</button>
            </div>
            <canvas id="canvas" style="display:none;"></canvas>
            <script>
                const video = document.getElementById('video');
                const canvas = document.getElementById('canvas');
                const captureButton = document.getElementById('captureButton');

                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                    .then(stream => {
                        video.srcObject = stream;
                    })
                    .catch(error => {
                        console.error('Error accessing camera:', error);
                        window.close();
                    });

                captureButton.addEventListener('click', () => {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    canvas.toBlob(blob => {
                        const file = new File([blob], "camera_photo.jpg", { type: "image/jpeg" });
                        window.opener.handleCapturedImage('${type}', file);
                        window.close();
                    }, 'image/jpeg');
                });
            </script>
        </body>
        </html>
    `);
}

function handleCapturedImage(type, file) {
    const fileInput = document.getElementById(`${type}FileInput`);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    
    // Update the file name display
    document.getElementById(`${type}FileName`).textContent = file.name;
}

// Ensure these event listeners are added after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    ['identifyFileInput', 'diagnoseFileInput'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', e => {
                const file = e.target.files[0];
                const type = id.replace('FileInput', '');
                const fileNameSpan = document.getElementById(`${type}FileName`);
                if (fileNameSpan) {
                    if (file) {
                        if (file.size > 4 * 1024 * 1024) {
                            alert('File size exceeds 4MB limit. Please choose a smaller file.');
                            e.target.value = '';
                            fileNameSpan.textContent = 'No file chosen';
                        } else {
                            fileNameSpan.textContent = file.name;
                        }
                    } else {
                        fileNameSpan.textContent = 'No file chosen';
                    }
                }
            });
        }
    });
});

async function analyzeImage(type, maxRetries = 3) {
    const fileInput = document.getElementById(`${type}FileInput`);
    const loadingDiv = document.getElementById('loading');
    const analysisInfoDiv = document.getElementById('analysisInfo');

    if (!fileInput.files.length) {
        analysisInfoDiv.innerHTML = '<p class="error">Please upload an image first.</p>';
        return;
    }

    const file = fileInput.files[0];
    loadingDiv.style.display = 'block';
    analysisInfoDiv.innerHTML = '';
    const stopLoadingMessage = updateLoadingMessage();

    try {
        const base64Data = await getResizedBase64(file, 600);

        if (!base64Data) {
            throw new Error('Invalid image data');
        }

        const prompt = type === 'identify' 
            ? "Analyze this plant image. Provide the plant's common name, scientific name, and key characteristics. Format: Common Name (Scientific Name) - Key Characteristics."
            : "Analyze this plant for diseases. Identify visible diseases or pests. Format: Disease Name - Key Symptoms - Quick Treatment.";

        let retryCount = 0;
        let retryDelay = 1000;

        while (retryCount < maxRetries) {
            try {
                await apiThrottle.throttle();
                console.log('Sending API request...');
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const response = await fetch(`${API_URL}?key=${API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { 
                                    inline_data: { 
                                        mime_type: file.type,
                                        data: base64Data
                                    }
                                }
                            ]
                        }]
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json();
                const analysis = validateApiResponse(responseData);
                const formattedAnalysis = formatAnalysis(type, analysis);

                animateResult();
                analysisInfoDiv.innerHTML = formattedAnalysis;
                return;
            } catch (error) {
                console.error(`Attempt ${retryCount + 1} failed:`, error);
                if (error.name === 'AbortError') {
                    console.log('Request timed out');
                    break;
                }
                if (retryCount === maxRetries - 1) {
                    throw error;
                }
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 2;
            }
        }
        throw new Error('Max retry attempts reached');
    } catch (error) {
        console.error('Final Error:', error);
        animateResult();
        const fallbackAnalysis = getFallbackAnalysis(type);
        analysisInfoDiv.innerHTML = `
            <p class="error">We're sorry, but we couldn't analyze your image at this time. Our system is currently experiencing high traffic.</p>
            <p>Please try again in a few minutes. In the meantime, here's a sample analysis:</p>
            ${fallbackAnalysis}
        `;
        shakeElement('analysisInfo');
    } finally {
        stopLoadingMessage();
        loadingDiv.style.display = 'none';
    }
}

const commonPlantLocations = {
    "Snake Plant": "Native to tropical West Africa, commonly found in households worldwide. Particularly popular in North America, Europe, and Asia.",
    "Aloe Vera": "Native to the Arabian Peninsula, now cultivated globally. Common in Mediterranean climates and as a houseplant worldwide.",
    "Spider Plant": "Native to tropical and southern Africa, popular as a houseplant in North America, Europe, and Australia.",
    "Peace Lily": "Native to tropical regions of the Americas and southeastern Asia, common in homes and offices worldwide.",
    "Pothos": "Native to the Solomon Islands, popular in homes and offices across North America, Europe, and Asia.",
    // Add more common plants as needed
};

function formatAnalysis(type, analysis) {
    try {
        if (typeof analysis !== 'string') {
            throw new Error('Invalid analysis format');
        }

        let formattedResult = '';
        let plantName = '';

        if (type === 'identify') {
            const match = analysis.match(/\*\*(.*?)\*\*\s*-\s*(.*)/);
            if (match) {
                const [, name, description] = match;
                const [commonName, scientificName] = name.split('(').map(part => part.trim().replace(')', ''));
                plantName = commonName;
                
                formattedResult = `
                    <h2>${commonName}</h2>
                    <p><strong>Scientific Name:</strong> ${scientificName}</p>
                    <p><strong>Description:</strong> ${description.trim()}</p>
                `;
            } else {
                formattedResult = `
                    <h2>Plant Identification</h2>
                    <p>${analysis}</p>
                `;
            }
        } else {
            const parts = analysis.split(/\s*-\s*/);
            if (parts.length >= 3) {
                const [disease, symptoms, treatment] = parts;
                plantName = disease;
                formattedResult = `
                    <h2>${disease}</h2>
                    <p><strong>Key Symptoms:</strong> ${symptoms}</p>
                    <p><strong>Quick Treatment:</strong> ${treatment}</p>
                `;
            } else {
                formattedResult = `<p>${analysis}</p>`;
            }
        }
        
        const careTips = getPlantCareTips(plantName);
        const careTipsHtml = `
            <div id="careTips">
                <h3>Plant Care Tips</h3>
                <ul id="careTipsList">
                    ${careTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;

        return formattedResult + careTipsHtml;
    } catch (error) {
        console.error('Error formatting analysis:', error);
        return `<p>${analysis}</p>`;
    }
}

function getFallbackAnalysis(type) {
    return getDetailedFallbackAnalysis(type);
}

function getDetailedFallbackAnalysis(type) {
    const data = fallbackData[type];
    const randomIndex = Math.floor(Math.random() * data.length);
    const item = data[randomIndex];
    
    if (type === 'identify') {
        // Add more detailed sample locations for each plant in the fallback data
        const locations = {
            "Sunflower": "Open, sunny areas across North and South America. Particularly common in the Great Plains of the United States, as well as in Ukraine and Russia.",
            "Rose": "Gardens worldwide, with species native to various regions. For example, Rosa gallica is native to southern and central Europe, while Rosa chinensis originates from China and Burma.",
            "Lavender": "Mediterranean regions, especially in France (Provence), Spain, and England. Also cultivated in Australia, New Zealand, and the United States (California and Texas).",
            "Tulip": "Originally from Central Asia, including countries like Kazakhstan and Kyrgyzstan. Now widely cultivated in the Netherlands, which is famous for its tulip fields.",
            "Orchid": "Diverse habitats worldwide, from tropical rainforests in South America and Southeast Asia to alpine meadows in Europe. Specific species are endemic to particular regions, such as Vanda coerulea in northeastern India and Myanmar."
        };
        const [commonName, scientificName] = item.name.split('(');
        const location = locations[commonName.trim()] || "Various regions depending on the species and cultivation";
        
        return `
            <h2>Plant Name</h2>
            <p>${commonName.trim()}</p>
            <h3>Scientific Name</h3>
            <p>${scientificName.replace(')', '')}</p>
            <h3>Plant Details</h3>
            <p><strong>Key Characteristics:</strong> ${item.characteristics}</p>
            <h3>Plant Location</h3>
            <p>${location}</p>
            <p><strong>Additional Info:</strong> This plant is commonly found in gardens and is known for its beauty and ease of care.</p>
        `;
    } else {
        // Keep the disease diagnosis format as is
        return `
            <h2>${item.disease}</h2>
            <p><strong>Key Symptoms:</strong> ${item.symptoms}</p>
            <p><strong>Quick Treatment:</strong> ${item.treatment}</p>
            <p><strong>Prevention:</strong> Maintain good plant hygiene, ensure proper watering, and provide adequate air circulation to prevent future occurrences.</p>
        `;
    }
}

// Ensure GSAP is loaded before using it
function animateResult() {
    const result = document.getElementById('result');
    if (result && typeof gsap !== 'undefined') {
        result.style.display = 'none';
        gsap.to(result, {duration: 0.5, display: 'block', opacity: 1, y: 0, ease: 'power3.out'});
        
        // Animate result content
        gsap.from('#analysisInfo h2, #analysisInfo h3', {duration: 0.5, y: 20, opacity: 0, ease: 'power3.out', stagger: 0.2, delay: 0.2});
        gsap.from('#analysisInfo p', {duration: 0.5, x: -20, opacity: 0, ease: 'power3.out', stagger: 0.1, delay: 0.5});
    }
}

function shakeElement(elementId) {
    const element = document.getElementById(elementId);
    if (element && typeof gsap !== 'undefined') {
        gsap.to(element, {duration: 0.1, x: 10, repeat: 5, yoyo: true, ease: 'power1.inOut'});
    }
}

function switchTab(tabName) {
    console.log(`Switching to tab: ${tabName}`); // For debugging
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-selected', 'false');
    });

    const selectedTab = document.getElementById(`${tabName}Tab`);
    const selectedButton = document.querySelector(`.tab-button[onclick="switchTab('${tabName}')"]`);
    
    if (selectedTab) {
        selectedTab.classList.add('active');
    } else {
        console.error(`Tab content not found: ${tabName}Tab`);
    }

    if (selectedButton) {
        selectedButton.classList.add('active');
        selectedButton.setAttribute('aria-selected', 'true');
    } else {
        console.error(`Tab button not found for: ${tabName}`);
    }
}

// Add this immediately after the switchTab function
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');
    // You can add any initialization code here
});

async function getResizedBase64(file, maxSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let [width, height] = [img.width, img.height];
            if (width > height) {
                if (width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }
            [canvas.width, canvas.height] = [width, height];
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL(file.type).split(',')[1]);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function updateLoadingMessage() {
    let dots = '';
    let seconds = 0;
    const loadingDiv = document.getElementById('loading');
    const interval = setInterval(() => {
        dots = dots.length < 3 ? dots + '.' : '';
        seconds++;
        loadingDiv.innerHTML = `
            <div class="spinner"></div>
            <p>Analyzing image${dots}</p>
            <p>This may take up to 60 seconds. Time elapsed: ${seconds} seconds</p>
        `;
        if (seconds >= 60) {
            clearInterval(interval);
        }
    }, 1000);
    return () => clearInterval(interval);
}

function validateApiResponse(responseData) {
    if (!responseData || typeof responseData !== 'object') {
        throw new Error('Invalid API response format');
    }
    if (!Array.isArray(responseData.candidates) || responseData.candidates.length === 0) {
        throw new Error('No analysis candidates in the response');
    }
    const candidate = responseData.candidates[0];
    if (!candidate.content || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
        throw new Error('Invalid content format in API response');
    }
    const text = candidate.content.parts[0].text;
    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Empty or invalid analysis text');
    }
    return text;
}

// Add this at the end of your script.js file

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    animateElements();
    initDarkMode();
    initAccessibility();
});

function initParticles() {
    particlesJS('particles', {
        particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: "#ffffff" },
            shape: { type: "circle", stroke: { width: 0, color: "#000000" }, polygon: { nb_sides: 5 } },
            opacity: { value: 0.5, random: false, anim: { enable: false, speed: 1, opacity_min: 0.1, sync: false } },
            size: { value: 3, random: true, anim: { enable: false, speed: 40, size_min: 0.1, sync: false } },
            line_linked: { enable: true, distance: 150, color: "#ffffff", opacity: 0.4, width: 1 },
            move: { enable: true, speed: 6, direction: "none", random: false, straight: false, out_mode: "out", bounce: false, attract: { enable: false, rotateX: 600, rotateY: 1200 } }
        },
        interactivity: {
            detect_on: "canvas",
            events: { onhover: { enable: true, mode: "repulse" }, onclick: { enable: true, mode: "push" }, resize: true },
            modes: { grab: { distance: 400, line_linked: { opacity: 1 } }, bubble: { distance: 400, size: 40, duration: 2, opacity: 8, speed: 3 }, repulse: { distance: 200, duration: 0.4 }, push: { particles_nb: 4 }, remove: { particles_nb: 2 } }
        },
        retina_detect: true
    });
}

function animateElements() {
    gsap.from('.container', {duration: 1, y: 50, opacity: 0, ease: 'power3.out'});
    gsap.from('h1', {duration: 1, y: -50, opacity: 0, ease: 'power3.out', delay: 0.5});
    gsap.from('.tab-button', {duration: 0.5, scale: 0.5, opacity: 0, ease: 'back.out(1.7)', stagger: 0.2, delay: 1});
}

function openCamera(type) {
    const cameraWindow = window.open('', '_blank', 'width=600,height=500');
    cameraWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Take Photo</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    background-color: #f0f0f0;
                    font-family: Arial, sans-serif;
                }
                .camera-container {
                    position: relative;
                    width: 100%;
                    max-width: 600px;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                #video {
                    width: 100%;
                    display: block;
                }
                #captureButton {
                    position: absolute;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: 12px 24px;
                    font-size: 18px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 30px;
                    cursor: pointer;
                    transition: background-color 0.3s ease;
                }
                #captureButton:hover {
                    background-color: #45a049;
                }
                .camera-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border: 2px solid #fff;
                    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
                    pointer-events: none;
                }
            </style>
        </head>
        <body>
            <div class="camera-container">
                <video id="video" autoplay playsinline></video>
                <div class="camera-overlay"></div>
                <button id="captureButton">Capture Photo</button>
            </div>
            <canvas id="canvas" style="display:none;"></canvas>
            <script>
                const video = document.getElementById('video');
                const canvas = document.getElementById('canvas');
                const captureButton = document.getElementById('captureButton');

                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                    .then(stream => {
                        video.srcObject = stream;
                    })
                    .catch(error => {
                        console.error('Error accessing camera:', error);
                        window.close();
                    });

                captureButton.addEventListener('click', () => {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    canvas.toBlob(blob => {
                        const file = new File([blob], "camera_photo.jpg", { type: "image/jpeg" });
                        window.opener.handleCapturedImage('${type}', file);
                        window.close();
                    }, 'image/jpeg');
                });
            </script>
        </body>
        </html>
    `);
}

function handleCapturedImage(type, file) {
    const fileInput = document.getElementById(`${type}FileInput`);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    
    // Update the file name display
    document.getElementById(`${type}FileName`).textContent = file.name;
}

// Ensure these event listeners are added after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    ['identifyFileInput', 'diagnoseFileInput'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', e => {
                const file = e.target.files[0];
                const type = id.replace('FileInput', '');
                const fileNameSpan = document.getElementById(`${type}FileName`);
                if (fileNameSpan) {
                    if (file) {
                        if (file.size > 4 * 1024 * 1024) {
                            alert('File size exceeds 4MB limit. Please choose a smaller file.');
                            e.target.value = '';
                            fileNameSpan.textContent = 'No file chosen';
                        } else {
                            fileNameSpan.textContent = file.name;
                        }
                    } else {
                        fileNameSpan.textContent = 'No file chosen';
                    }
                }
            });
        }
    });
});

async function analyzeImage(type, maxRetries = 3) {
    const fileInput = document.getElementById(`${type}FileInput`);
    const loadingDiv = document.getElementById('loading');
    const analysisInfoDiv = document.getElementById('analysisInfo');

    if (!fileInput.files.length) {
        analysisInfoDiv.innerHTML = '<p class="error">Please upload an image first.</p>';
        return;
    }

    const file = fileInput.files[0];
    loadingDiv.style.display = 'block';
    analysisInfoDiv.innerHTML = '';
    const stopLoadingMessage = updateLoadingMessage();

    try {
        const base64Data = await getResizedBase64(file, 600);

        if (!base64Data) {
            throw new Error('Invalid image data');
        }

        const prompt = type === 'identify' 
            ? "Analyze this plant image. Provide the plant's common name, scientific name, and key characteristics. Format: Common Name (Scientific Name) - Key Characteristics."
            : "Analyze this plant for diseases. Identify visible diseases or pests. Format: Disease Name - Key Symptoms - Quick Treatment.";

        let retryCount = 0;
        let retryDelay = 1000;

        while (retryCount < maxRetries) {
            try {
                await apiThrottle.throttle();
                console.log('Sending API request...');
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const response = await fetch(`${API_URL}?key=${API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { 
                                    inline_data: { 
                                        mime_type: file.type,
                                        data: base64Data
                                    }
                                }
                            ]
                        }]
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json();
                const analysis = validateApiResponse(responseData);
                const formattedAnalysis = formatAnalysis(type, analysis);

                animateResult();
                analysisInfoDiv.innerHTML = formattedAnalysis;
                return;
            } catch (error) {
                console.error(`Attempt ${retryCount + 1} failed:`, error);
                if (error.name === 'AbortError') {
                    console.log('Request timed out');
                    break;
                }
                if (retryCount === maxRetries - 1) {
                    throw error;
                }
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 2;
            }
        }
        throw new Error('Max retry attempts reached');
    } catch (error) {
        console.error('Final Error:', error);
        animateResult();
        const fallbackAnalysis = getFallbackAnalysis(type);
        analysisInfoDiv.innerHTML = `
            <p class="error">We're sorry, but we couldn't analyze your image at this time. Our system is currently experiencing high traffic.</p>
            <p>Please try again in a few minutes. In the meantime, here's a sample analysis:</p>
            ${fallbackAnalysis}
        `;
        shakeElement('analysisInfo');
    } finally {
        stopLoadingMessage();
        loadingDiv.style.display = 'none';
    }
}

const commonPlantLocations = {
    "Snake Plant": "Native to tropical West Africa, commonly found in households worldwide. Particularly popular in North America, Europe, and Asia.",
    "Aloe Vera": "Native to the Arabian Peninsula, now cultivated globally. Common in Mediterranean climates and as a houseplant worldwide.",
    "Spider Plant": "Native to tropical and southern Africa, popular as a houseplant in North America, Europe, and Australia.",
    "Peace Lily": "Native to tropical regions of the Americas and southeastern Asia, common in homes and offices worldwide.",
    "Pothos": "Native to the Solomon Islands, popular in homes and offices across North America, Europe, and Asia.",
    // Add more common plants as needed
};

function formatAnalysis(type, analysis) {
    try {
        if (typeof analysis !== 'string') {
            throw new Error('Invalid analysis format');
        }

        let formattedResult = '';
        let plantName = '';

        if (type === 'identify') {
            const match = analysis.match(/\*\*(.*?)\*\*\s*-\s*(.*)/);
            if (match) {
                const [, name, description] = match;
                const [commonName, scientificName] = name.split('(').map(part => part.trim().replace(')', ''));
                plantName = commonName;
                
                formattedResult = `
                    <h2>${commonName}</h2>
                    <p><strong>Scientific Name:</strong> ${scientificName}</p>
                    <p><strong>Description:</strong> ${description.trim()}</p>
                `;
            } else {
                formattedResult = `
                    <h2>Plant Identification</h2>
                    <p>${analysis}</p>
                `;
            }
        } else {
            const parts = analysis.split(/\s*-\s*/);
            if (parts.length >= 3) {
                const [disease, symptoms, treatment] = parts;
                plantName = disease;
                formattedResult = `
                    <h2>${disease}</h2>
                    <p><strong>Key Symptoms:</strong> ${symptoms}</p>
                    <p><strong>Quick Treatment:</strong> ${treatment}</p>
                `;
            } else {
                formattedResult = `<p>${analysis}</p>`;
            }
        }
        
        const careTips = getPlantCareTips(plantName);
        const careTipsHtml = `
            <div id="careTips">
                <h3>Plant Care Tips</h3>
                <ul id="careTipsList">
                    ${careTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;

        return formattedResult + careTipsHtml;
    } catch (error) {
        console.error('Error formatting analysis:', error);
        return `<p>${analysis}</p>`;
    }
}

function getFallbackAnalysis(type) {
    return getDetailedFallbackAnalysis(type);
}

function getDetailedFallbackAnalysis(type) {
    const data = fallbackData[type];
    const randomIndex = Math.floor(Math.random() * data.length);
    const item = data[randomIndex];
    
    if (type === 'identify') {
        // Add more detailed sample locations for each plant in the fallback data
        const locations = {
            "Sunflower": "Open, sunny areas across North and South America. Particularly common in the Great Plains of the United States, as well as in Ukraine and Russia.",
            "Rose": "Gardens worldwide, with species native to various regions. For example, Rosa gallica is native to southern and central Europe, while Rosa chinensis originates from China and Burma.",
            "Lavender": "Mediterranean regions, especially in France (Provence), Spain, and England. Also cultivated in Australia, New Zealand, and the United States (California and Texas).",
            "Tulip": "Originally from Central Asia, including countries like Kazakhstan and Kyrgyzstan. Now widely cultivated in the Netherlands, which is famous for its tulip fields.",
            "Orchid": "Diverse habitats worldwide, from tropical rainforests in South America and Southeast Asia to alpine meadows in Europe. Specific species are endemic to particular regions, such as Vanda coerulea in northeastern India and Myanmar."
        };
        const [commonName, scientificName] = item.name.split('(');
        const location = locations[commonName.trim()] || "Various regions depending on the species and cultivation";
        
        return `
            <h2>Plant Name</h2>
            <p>${commonName.trim()}</p>
            <h3>Scientific Name</h3>
            <p>${scientificName.replace(')', '')}</p>
            <h3>Plant Details</h3>
            <p><strong>Key Characteristics:</strong> ${item.characteristics}</p>
            <h3>Plant Location</h3>
            <p>${location}</p>
            <p><strong>Additional Info:</strong> This plant is commonly found in gardens and is known for its beauty and ease of care.</p>
        `;
    } else {
        // Keep the disease diagnosis format as is
        return `
            <h2>${item.disease}</h2>
            <p><strong>Key Symptoms:</strong> ${item.symptoms}</p>
            <p><strong>Quick Treatment:</strong> ${item.treatment}</p>
            <p><strong>Prevention:</strong> Maintain good plant hygiene, ensure proper watering, and provide adequate air circulation to prevent future occurrences.</p>
        `;
    }
}

// Ensure GSAP is loaded before using it
function animateResult() {
    const result = document.getElementById('result');
    if (result && typeof gsap !== 'undefined') {
        result.style.display = 'none';
        gsap.to(result, {duration: 0.5, display: 'block', opacity: 1, y: 0, ease: 'power3.out'});
        
        // Animate result content
        gsap.from('#analysisInfo h2, #analysisInfo h3', {duration: 0.5, y: 20, opacity: 0, ease: 'power3.out', stagger: 0.2, delay: 0.2});
        gsap.from('#analysisInfo p', {duration: 0.5, x: -20, opacity: 0, ease: 'power3.out', stagger: 0.1, delay: 0.5});
    }
}

function shakeElement(elementId) {
    const element = document.getElementById(elementId);
    if (element && typeof gsap !== 'undefined') {
        gsap.to(element, {duration: 0.1, x: 10, repeat: 5, yoyo: true, ease: 'power1.inOut'});
    }
}

// Add this function near the top of your script.js file
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Deactivate all tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-selected', 'false');
    });

    // Show the selected tab content
    const selectedTab = document.getElementById(`${tabName}Tab`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    // Activate the clicked tab button
    const selectedButton = document.querySelector(`.tab-button[onclick="switchTab('${tabName}')"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
        selectedButton.setAttribute('aria-selected', 'true');
    }
}

async function getResizedBase64(file, maxSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let [width, height] = [img.width, img.height];
            if (width > height) {
                if (width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }
            [canvas.width, canvas.height] = [width, height];
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL(file.type).split(',')[1]);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function updateLoadingMessage() {
    let dots = '';
    let seconds = 0;
    const loadingDiv = document.getElementById('loading');
    const interval = setInterval(() => {
        dots = dots.length < 3 ? dots + '.' : '';
        seconds++;
        loadingDiv.innerHTML = `
            <div class="spinner"></div>
            <p>Analyzing image${dots}</p>
            <p>This may take up to 60 seconds. Time elapsed: ${seconds} seconds</p>
        `;
        if (seconds >= 60) {
            clearInterval(interval);
        }
    }, 1000);
    return () => clearInterval(interval);
}

function validateApiResponse(responseData) {
    if (!responseData || typeof responseData !== 'object') {
        throw new Error('Invalid API response format');
    }
    if (!Array.isArray(responseData.candidates) || responseData.candidates.length === 0) {
        throw new Error('No analysis candidates in the response');
    }
    const candidate = responseData.candidates[0];
    if (!candidate.content || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
        throw new Error('Invalid content format in API response');
    }
    const text = candidate.content.parts[0].text;
    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Empty or invalid analysis text');
    }
    return text;
}

// Add this at the end of your script.js file

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    animateElements();
    initDarkMode();
    initAccessibility();
});

function initParticles() {
    particlesJS('particles', {
        particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: "#ffffff" },
            shape: { type: "circle", stroke: { width: 0, color: "#000000" }, polygon: { nb_sides: 5 } },
            opacity: { value: 0.5, random: false, anim: { enable: false, speed: 1, opacity_min: 0.1, sync: false } },
            size: { value: 3, random: true, anim: { enable: false, speed: 40, size_min: 0.1, sync: false } },
            line_linked: { enable: true, distance: 150, color: "#ffffff", opacity: 0.4, width: 1 },
            move: { enable: true, speed: 6, direction: "none", random: false, straight: false, out_mode: "out", bounce: false, attract: { enable: false, rotateX: 600, rotateY: 1200 } }
        },
        interactivity: {
            detect_on: "canvas",
            events: { onhover: { enable: true, mode: "repulse" }, onclick: { enable: true, mode: "push" }, resize: true },
            modes: { grab: { distance: 400, line_linked: { opacity: 1 } }, bubble: { distance: 400, size: 40, duration: 2, opacity: 8, speed: 3 }, repulse: { distance: 200, duration: 0.4 }, push: { particles_nb: 4 }, remove: { particles_nb: 2 } }
        },
        retina_detect: true
    });
}

function animateElements() {
    gsap.from('.container', {duration: 1, y: 50, opacity: 0, ease: 'power3.out'});
    gsap.from('h1', {duration: 1, y: -50, opacity: 0, ease: 'power3.out', delay: 0.5});
    gsap.from('.tab-button', {duration: 0.5, scale: 0.5, opacity: 0, ease: 'back.out(1.7)', stagger: 0.2, delay: 1});
}
function formatAnalysis(type, analysis) {
    try {
        if (typeof analysis !== 'string') {
            throw new Error('Invalid analysis format');
        }

        let formattedResult = '';
        let plantName = '';

        if (type === 'identify') {
            const match = analysis.match(/\*\*(.*?)\*\*\s*-\s*(.*)/);
            if (match) {
                const [, name, description] = match;
                const [commonName, scientificName] = name.split('(').map(part => part.trim().replace(')', ''));
                plantName = commonName;
                
                formattedResult = `
                    <h2>${commonName}</h2>
                    <p><strong>Scientific Name:</strong> ${scientificName}</p>
                    <p><strong>Description:</strong> ${description.trim()}</p>
                `;
            } else {
                formattedResult = `
                    <h2>Plant Identification</h2>
                    <p>${analysis}</p>
                `;
            }
        } else {
            const parts = analysis.split(/\s*-\s*/);
            if (parts.length >= 3) {
                const [disease, symptoms, treatment] = parts;
                plantName = disease;
                formattedResult = `
                    <h2>${disease}</h2>
                    <p><strong>Key Symptoms:</strong> ${symptoms}</p>
                    <p><strong>Quick Treatment:</strong> ${treatment}</p>
                `;
            } else {
                formattedResult = `<p>${analysis}</p>`;
            }
        }
        
        const careTips = getPlantCareTips(plantName);
        const careTipsHtml = `
            <div id="careTips">
                <h3>Plant Care Tips</h3>
                <ul id="careTipsList">
                    ${careTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;

        return formattedResult + careTipsHtml;
    } catch (error) {
        console.error('Error formatting analysis:', error);
        return `<p>${analysis}</p>`;
    }
}

function getFallbackAnalysis(type) {
    return getDetailedFallbackAnalysis(type);
}

function getDetailedFallbackAnalysis(type) {
    const data = fallbackData[type];
    const randomIndex = Math.floor(Math.random() * data.length);
    const item = data[randomIndex];
    if (type === 'identify') {
    }
        // Add more detailed sample locations for each plant in the fallback data
        const locations = {
            "Sunflower": "Open, sunny areas across North and South America. Particularly common in the Great Plains of the United States, as well as in Ukraine and Russia.",
            "Rose": "Gardens worldwide, with species native to various regions. For example, Rosa gallica is native to southern and central Europe, while Rosa chinensis originates from China and Burma.",
            "Lavender": "Mediterranean regions, especially in France (Provence), Spain, and England. Also cultivated in Australia, New Zealand, and the United States (California and Texas).",
            "Tulip": "Originally from Central Asia, including countries like Kazakhstan and Kyrgyzstan. Now widely cultivated in the Netherlands, which is famous for its tulip fields.",}
const API_KEY = 'AIzaSyBs8VIj2Y0smjU4OtJDPFUBVV1mmHOWYgQ'; // Updated API key
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';
const fallbackData = {
    identify: [
        { name: "Sunflower (Helianthus annuus)", characteristics: "Tall annual with large yellow flower heads" },
        { name: "Rose (Rosa spp.)", characteristics: "Woody perennial with fragrant flowers in various colors" },
        { name: "Lavender (Lavandula)", characteristics: "Aromatic shrub with purple flower spikes" },
        { name: "Tulip (Tulipa)", characteristics: "Spring-blooming bulbous plant with cup-shaped flowers" },
        { name: "Orchid (Orchidaceae)", characteristics: "Diverse family of flowering plants with complex blooms" }
    ],
    diagnose: [
        { disease: "Powdery Mildew", symptoms: "White powdery spots on leaves", treatment: "Apply fungicide and improve air circulation" },
        { disease: "Aphid Infestation", symptoms: "Clusters of small insects on stems and leaves", treatment: "Use insecticidal soap or neem oil" },
        { disease: "Root Rot", symptoms: "Wilting, yellowing leaves and soft, brown roots", treatment: "Improve drainage and reduce watering" },
        { disease: "Leaf Spot", symptoms: "Brown or black spots on leaves", treatment: "Remove affected leaves and apply fungicide" },
        { disease: "Spider Mites", symptoms: "Tiny specks on leaves, fine webbing", treatment: "Increase humidity and use miticide if severe" }
    ]
};

const apiThrottle = {
    lastCallTime: 0,
    minInterval: 1000, // Minimum time between API calls in milliseconds
    async throttle() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;
        if (timeSinceLastCall < this.minInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
        }
        this.lastCallTime = Date.now();
    }
};

function openGallery(type) {
    document.getElementById(`${type}FileInput`).click();
}

function openCamera(type) {
    const cameraWindow = window.open('', '_blank', 'width=600,height=500');
    cameraWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Take Photo</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    background-color: #f0f0f0;
                    font-family: Arial, sans-serif;
                }
                .camera-container {
                    position: relative;
                    width: 100%;
                    max-width: 600px;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                #video {
                    width: 100%;
                    display: block;
                }
                #captureButton {
                    position: absolute;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: 12px 24px;
                    font-size: 18px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 30px;
                    cursor: pointer;
                    transition: background-color 0.3s ease;
                }
                #captureButton:hover {
                    background-color: #45a049;
                }
                .camera-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border: 2px solid #fff;
                    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
                    pointer-events: none;
                }
            </style>
        </head>
        <body>
            <div class="camera-container">
                <video id="video" autoplay playsinline></video>
                <div class="camera-overlay"></div>
                <button id="captureButton">Capture Photo</button>
            </div>
            <canvas id="canvas" style="display:none;"></canvas>
            <script>
                const video = document.getElementById('video');
                const canvas = document.getElementById('canvas');
                const captureButton = document.getElementById('captureButton');

                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                    .then(stream => {
                        video.srcObject = stream;
                    })
                    .catch(error => {
                        console.error('Error accessing camera:', error);
                        window.close();
                    });

                captureButton.addEventListener('click', () => {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    canvas.toBlob(blob => {
                        const file = new File([blob], "camera_photo.jpg", { type: "image/jpeg" });
                        window.opener.handleCapturedImage('${type}', file);
                        window.close();
                    }, 'image/jpeg');
                });
            </script>
        </body>
        </html>
    `);
}

function handleCapturedImage(type, file) {
    const fileInput = document.getElementById(`${type}FileInput`);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    
    // Update the file name display
    document.getElementById(`${type}FileName`).textContent = file.name;
}

['identifyFileInput', 'diagnoseFileInput'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => handleFileSelect(e, id.replace('FileInput', '')));
});

function handleFileSelect(event, type) {
    const file = event.target.files[0];
    const fileNameSpan = document.getElementById(`${type}FileName`);
    if (file) {
        if (file.size > 4 * 1024 * 1024) {
            alert('File size exceeds 4MB limit. Please choose a smaller file.');
            event.target.value = '';
            fileNameSpan.textContent = 'No file chosen';
        } else {
            fileNameSpan.textContent = file.name;
        }
    } else {
        fileNameSpan.textContent = 'No file chosen';
    }
}

async function analyzeImage(type, maxRetries = 3) {
    const fileInput = document.getElementById(`${type}FileInput`);
    const loadingDiv = document.getElementById('loading');
    const analysisInfoDiv = document.getElementById('analysisInfo');

    if (!fileInput.files.length) {
        analysisInfoDiv.innerHTML = '<p class="error">Please upload an image first.</p>';
        return;
    }

    const file = fileInput.files[0];
    loadingDiv.style.display = 'block';
    analysisInfoDiv.innerHTML = '';
    const stopLoadingMessage = updateLoadingMessage();

    try {
        const base64Data = await getResizedBase64(file, 600);

        if (!base64Data) {
            throw new Error('Invalid image data');
        }

        const prompt = type === 'identify' 
            ? "Analyze this plant image. Provide the plant's common name, scientific name, and key characteristics. Format: Common Name (Scientific Name) - Key Characteristics."
            : "Analyze this plant for diseases. Identify visible diseases or pests. Format: Disease Name - Key Symptoms - Quick Treatment.";

        let retryCount = 0;
        let retryDelay = 1000;

        while (retryCount < maxRetries) {
            try {
                await apiThrottle.throttle();
                console.log('Sending API request...');
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const response = await fetch(`${API_URL}?key=${API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { 
                                    inline_data: { 
                                        mime_type: file.type,
                                        data: base64Data
                                    }
                                }
                            ]
                        }]
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json();
                const analysis = validateApiResponse(responseData);
                const formattedAnalysis = formatAnalysis(type, analysis);

                animateResult();
                analysisInfoDiv.innerHTML = formattedAnalysis;
                return;
            } catch (error) {
                console.error(`Attempt ${retryCount + 1} failed:`, error);
                if (error.name === 'AbortError') {
                    console.log('Request timed out');
                    break;
                }
                if (retryCount === maxRetries - 1) {
                    throw error;
                }
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 2;
            }
        }
        throw new Error('Max retry attempts reached');
    } catch (error) {
        console.error('Final Error:', error);
        animateResult();
        const fallbackAnalysis = getFallbackAnalysis(type);
        analysisInfoDiv.innerHTML = `
            <p class="error">We're sorry, but we couldn't analyze your image at this time. Our system is currently experiencing high traffic.</p>
            <p>Please try again in a few minutes. In the meantime, here's a sample analysis:</p>
            ${fallbackAnalysis}
        `;
        shakeElement('analysisInfo');
    } finally {
        stopLoadingMessage();
        loadingDiv.style.display = 'none';
    }
}

const commonPlantLocations = {
    "Snake Plant": "Native to tropical West Africa, commonly found in households worldwide. Particularly popular in North America, Europe, and Asia.",
    "Aloe Vera": "Native to the Arabian Peninsula, now cultivated globally. Common in Mediterranean climates and as a houseplant worldwide.",
    "Spider Plant": "Native to tropical and southern Africa, popular as a houseplant in North America, Europe, and Australia.",
    "Peace Lily": "Native to tropical regions of the Americas and southeastern Asia, common in homes and offices worldwide.",
    "Pothos": "Native to the Solomon Islands, popular in homes and offices across North America, Europe, and Asia.",
    // Add more common plants as needed
};

function formatAnalysis(type, analysis) {
    try {
        if (typeof analysis !== 'string') {
            throw new Error('Invalid analysis format');
        }

        let formattedResult = '';
        let plantName = '';

        if (type === 'identify') {
            const match = analysis.match(/\*\*(.*?)\*\*\s*-\s*(.*)/);
            if (match) {
                const [, name, description] = match;
                const [commonName, scientificName] = name.split('(').map(part => part.trim().replace(')', ''));
                plantName = commonName;
                
                formattedResult = `
                    <h2>${commonName}</h2>
                    <p><strong>Scientific Name:</strong> ${scientificName}</p>
                    <p><strong>Description:</strong> ${description.trim()}</p>
                `;
            } else {
                formattedResult = `
                    <h2>Plant Identification</h2>
                    <p>${analysis}</p>
                `;
            }
        } else {
            const parts = analysis.split(/\s*-\s*/);
            if (parts.length >= 3) {
                const [disease, symptoms, treatment] = parts;
                plantName = disease;
                formattedResult = `
                    <h2>${disease}</h2>
                    <p><strong>Key Symptoms:</strong> ${symptoms}</p>
                    <p><strong>Quick Treatment:</strong> ${treatment}</p>
                `;
            } else {
                formattedResult = `<p>${analysis}</p>`;
            }
        }
        
        const careTips = getPlantCareTips(plantName);
        const careTipsHtml = `
            <div id="careTips">
                <h3>Plant Care Tips</h3>
                <ul id="careTipsList">
                    ${careTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;

        return formattedResult + careTipsHtml;
    } catch (error) {
        console.error('Error formatting analysis:', error);
        return `<p>${analysis}</p>`;
    }
}

function getFallbackAnalysis(type) {
    return getDetailedFallbackAnalysis(type);
}

function getDetailedFallbackAnalysis(type) {
    const data = fallbackData[type];
    const randomIndex = Math.floor(Math.random() * data.length);
    const item = data[randomIndex];
    
    if (type === 'identify') {
        // Add more detailed sample locations for each plant in the fallback data
        const locations = {
            "Sunflower": "Open, sunny areas across North and South America. Particularly common in the Great Plains of the United States, as well as in Ukraine and Russia.",
            "Rose": "Gardens worldwide, with species native to various regions. For example, Rosa gallica is native to southern and central Europe, while Rosa chinensis originates from China and Burma.",
            "Lavender": "Mediterranean regions, especially in France (Provence), Spain, and England. Also cultivated in Australia, New Zealand, and the United States (California and Texas).",
            "Tulip": "Originally from Central Asia, including countries like Kazakhstan and Kyrgyzstan. Now widely cultivated in the Netherlands, which is famous for its tulip fields.",
            "Orchid": "Diverse habitats worldwide, from tropical rainforests in South America and Southeast Asia to alpine meadows in Europe. Specific species are endemic to particular regions, such as Vanda coerulea in northeastern India and Myanmar."
        };
        const [commonName, scientificName] = item.name.split('(');
        const location = locations[commonName.trim()] || "Various regions depending on the species and cultivation";
        
        return `
            <h2>Plant Name</h2>
            <p>${commonName.trim()}</p>
            <h3>Scientific Name</h3>
            <p>${scientificName.replace(')', '')}</p>
            <h3>Plant Details</h3>
            <p><strong>Key Characteristics:</strong> ${item.characteristics}</p>
            <h3>Plant Location</h3>
            <p>${location}</p>
            <p><strong>Additional Info:</strong> This plant is commonly found in gardens and is known for its beauty and ease of care.</p>
        `;
    } else {
        // Keep the disease diagnosis format as is
        return `
            <h2>${item.disease}</h2>
            <p><strong>Key Symptoms:</strong> ${item.symptoms}</p>
            <p><strong>Quick Treatment:</strong> ${item.treatment}</p>
            <p><strong>Prevention:</strong> Maintain good plant hygiene, ensure proper watering, and provide adequate air circulation to prevent future occurrences.</p>
        `;
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
        button.style.transform = 'translateY(0)';
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    const activeButton = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
    activeButton.classList.add('active');
    activeButton.style.transform = 'translateY(-3px)';
    const activeContent = document.getElementById(`${tabName}Tab`);
    activeContent.classList.add('active');
    activeContent.style.display = 'block';
    activeContent.style.animation = 'fadeIn 0.5s ease';
}

async function getResizedBase64(file, maxSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let [width, height] = [img.width, img.height];
            if (width > height) {
                if (width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }
            [canvas.width, canvas.height] = [width, height];
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL(file.type).split(',')[1]);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

['identifyFileInput', 'diagnoseFileInput'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
        const file = e.target.files[0];
        const type = id.replace('FileInput', '');
        const fileNameSpan = document.getElementById(`${type}FileName`);
        if (file) {
            if (file.size > 4 * 1024 * 1024) {
                alert('File size exceeds 4MB limit. Please choose a smaller file.');
                e.target.value = '';
                fileNameSpan.textContent = 'No file chosen';
            } else {
                fileNameSpan.textContent = file.name;
            }
        } else {
            fileNameSpan.textContent = 'No file chosen';
        }
    });
});

function updateLoadingMessage() {
    let dots = '';
    let seconds = 0;
    const loadingDiv = document.getElementById('loading');
    const interval = setInterval(() => {
        dots = dots.length < 3 ? dots + '.' : '';
        seconds++;
        loadingDiv.innerHTML = `
            <div class="spinner"></div>
            <p>Analyzing image${dots}</p>
            <p>This may take up to 60 seconds. Time elapsed: ${seconds} seconds</p>
        `;
        if (seconds >= 60) {
            clearInterval(interval);
        }
    }, 1000);
    return () => clearInterval(interval);
}

function validateApiResponse(responseData) {
    if (!responseData || typeof responseData !== 'object') {
        throw new Error('Invalid API response format');
    }
    if (!Array.isArray(responseData.candidates) || responseData.candidates.length === 0) {
        throw new Error('No analysis candidates in the response');
    }
    const candidate = responseData.candidates[0];
    if (!candidate.content || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
        throw new Error('Invalid content format in API response');
    }
    const text = candidate.content.parts[0].text;
    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Empty or invalid analysis text');
    }
    return text;
}

function animateResult() {
    const result = document.getElementById('result');
    result.style.display = 'none';
    gsap.to(result, {duration: 0.5, display: 'block', opacity: 1, y: 0, ease: 'power3.out'});
}

function shakeElement(elementId) {
    const element = document.getElementById(elementId);
    gsap.to(element, {duration: 0.1, x: 10, repeat: 5, yoyo: true, ease: 'power1.inOut'});
}

// Add this at the end of your script.js file

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    animateElements();
    initDarkMode();
    initAccessibility();
});

function initParticles() {
    particlesJS('particles', {
        particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: "#ffffff" },
            shape: { type: "circle", stroke: { width: 0, color: "#000000" }, polygon: { nb_sides: 5 } },
            opacity: { value: 0.5, random: false, anim: { enable: false, speed: 1, opacity_min: 0.1, sync: false } },
            size: { value: 3, random: true, anim: { enable: false, speed: 40, size_min: 0.1, sync: false } },
            line_linked: { enable: true, distance: 150, color: "#ffffff", opacity: 0.4, width: 1 },
            move: { enable: true, speed: 6, direction: "none", random: false, straight: false, out_mode: "out", bounce: false, attract: { enable: false, rotateX: 600, rotateY: 1200 } }
        },
        interactivity: {
            detect_on: "canvas",
            events: { onhover: { enable: true, mode: "repulse" }, onclick: { enable: true, mode: "push" }, resize: true },
            modes: { grab: { distance: 400, line_linked: { opacity: 1 } }, bubble: { distance: 400, size: 40, duration: 2, opacity: 8, speed: 3 }, repulse: { distance: 200, duration: 0.4 }, push: { particles_nb: 4 }, remove: { particles_nb: 2 } }
        },
        retina_detect: true
    });
}

function animateElements() {
    gsap.from('.container', {duration: 1, y: 50, opacity: 0, ease: 'power3.out'});
    gsap.from('h1', {duration: 1, y: -50, opacity: 0, ease: 'power3.out', delay: 0.5});
    gsap.from('.tab-button', {duration: 0.5, scale: 0.5, opacity: 0, ease: 'back.out(1.7)', stagger: 0.2, delay: 1});

function formatAnalysis(type, analysis) {
    try {
        if (typeof analysis !== 'string') {
            throw new Error('Invalid analysis format');
        }

        let formattedResult = '';
        let plantName = '';

        if (type === 'identify') {
            const match = analysis.match(/\*\*(.*?)\*\*\s*-\s*(.*)/);
            if (match) {
                const [, name, description] = match;
                const [commonName, scientificName] = name.split('(').map(part => part.trim().replace(')', ''));
                plantName = commonName;
                
                formattedResult = `
                    <h2>${commonName}</h2>
                    <p><strong>Scientific Name:</strong> ${scientificName}</p>
                    <p><strong>Description:</strong> ${description.trim()}</p>
                `;
            } else {
                formattedResult = `
                    <h2>Plant Identification</h2>
                    <p>${analysis}</p>
                `;
            }
        } else {
            const parts = analysis.split(/\s*-\s*/);
            if (parts.length >= 3) {
                const [disease, symptoms, treatment] = parts;
                plantName = disease;
                formattedResult = `
                    <h2>${disease}</h2>
                    <p><strong>Key Symptoms:</strong> ${symptoms}</p>
                    <p><strong>Quick Treatment:</strong> ${treatment}</p>
                `;
            } else {
                formattedResult = `<p>${analysis}</p>`;
            }
        }
        
        const careTips = getPlantCareTips(plantName);
        const careTipsHtml = `
            <div id="careTips">
                <h3>Plant Care Tips</h3>
                <ul id="careTipsList">
                    ${careTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;

        return formattedResult + careTipsHtml;
    } catch (error) {
        console.error('Error formatting analysis:', error);
        return `<p>${analysis}</p>`;
    }
}

function getFallbackAnalysis(type) {
    return getDetailedFallbackAnalysis(type);
}

function getDetailedFallbackAnalysis(type) {
    const data = fallbackData[type];
    const randomIndex = Math.floor(Math.random() * data.length);
    const item = data[randomIndex];
    
    if (type === 'identify') {
        // Add more detailed sample locations for each plant in the fallback data
        const locations = {
            "Sunflower": "Open, sunny areas across North and South America. Particularly common in the Great Plains of the United States, as well as in Ukraine and Russia.",
            "Rose": "Gardens worldwide, with species native to various regions. For example, Rosa gallica is native to southern and central Europe, while Rosa chinensis originates from China and Burma.",
            "Lavender": "Mediterranean regions, especially in France (Provence), Spain, and England. Also cultivated in Australia, New Zealand, and the United States (California and Texas).",
            "Tulip": "Originally from Central Asia, including countries like Kazakhstan and Kyrgyzstan. Now widely cultivated in the Netherlands, which is famous for its tulip fields.",
            "Orchid": "Diverse habitats worldwide, from tropical rainforests in South America and Southeast Asia to alpine meadows in Europe. Specific species are endemic to particular regions, such as Vanda coerulea in northeastern India and Myanmar."
        };
const API_KEY = 'AIzaSyBs8VIj2Y0smjU4OtJDPFUBVV1mmHOWYgQ'; // Updated API key
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';
const fallbackData = {
    identify: [
        { name: "Sunflower (Helianthus annuus)", characteristics: "Tall annual with large yellow flower heads" },
        { name: "Rose (Rosa spp.)", characteristics: "Woody perennial with fragrant flowers in various colors" },
        { name: "Lavender (Lavandula)", characteristics: "Aromatic shrub with purple flower spikes" },
        { name: "Tulip (Tulipa)", characteristics: "Spring-blooming bulbous plant with cup-shaped flowers" },
        { name: "Orchid (Orchidaceae)", characteristics: "Diverse family of flowering plants with complex blooms" }
    ],
    diagnose: [
        { disease: "Powdery Mildew", symptoms: "White powdery spots on leaves", treatment: "Apply fungicide and improve air circulation" },
        { disease: "Aphid Infestation", symptoms: "Clusters of small insects on stems and leaves", treatment: "Use insecticidal soap or neem oil" },
        { disease: "Root Rot", symptoms: "Wilting, yellowing leaves and soft, brown roots", treatment: "Improve drainage and reduce watering" },
        { disease: "Leaf Spot", symptoms: "Brown or black spots on leaves", treatment: "Remove affected leaves and apply fungicide" },
        { disease: "Spider Mites", symptoms: "Tiny specks on leaves, fine webbing", treatment: "Increase humidity and use miticide if severe" }
    ]
};

const apiThrottle = {
    lastCallTime: 0,
    minInterval: 1000, // Minimum time between API calls in milliseconds
    async throttle() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;
        if (timeSinceLastCall < this.minInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
        }
        this.lastCallTime = Date.now();
    }
};

function openGallery(type) {
    document.getElementById(`${type}FileInput`).click();
}

function openCamera(type) {
    const cameraWindow = window.open('', '_blank', 'width=600,height=500');
    cameraWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Take Photo</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    background-color: #f0f0f0;
                    font-family: Arial, sans-serif;
                }
                .camera-container {
                    position: relative;
                    width: 100%;
                    max-width: 600px;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                #video {
                    width: 100%;
                    display: block;
                }
                #captureButton {
                    position: absolute;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: 12px 24px;
                    font-size: 18px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 30px;
                    cursor: pointer;
                    transition: background-color 0.3s ease;
                }
                #captureButton:hover {
                    background-color: #45a049;
                }
                .camera-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border: 2px solid #fff;
                    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
                    pointer-events: none;
                }
            </style>
        </head>
        <body>
            <div class="camera-container">
                <video id="video" autoplay playsinline></video>
                <div class="camera-overlay"></div>
                <button id="captureButton">Capture Photo</button>
            </div>
            <canvas id="canvas" style="display:none;"></canvas>
            <script>
                const video = document.getElementById('video');
                const canvas = document.getElementById('canvas');
                const captureButton = document.getElementById('captureButton');

                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                    .then(stream => {
                        video.srcObject = stream;
                    })
                    .catch(error => {
                        console.error('Error accessing camera:', error);
                        window.close();
                    });

                captureButton.addEventListener('click', () => {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    canvas.toBlob(blob => {
                        const file = new File([blob], "camera_photo.jpg", { type: "image/jpeg" });
                        window.opener.handleCapturedImage('${type}', file);
                        window.close();
                    }, 'image/jpeg');
                });
            </script>
        </body>
        </html>
    `);
}

function handleCapturedImage(type, file) {
    const fileInput = document.getElementById(`${type}FileInput`);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    
    // Update the file name display
    document.getElementById(`${type}FileName`).textContent = file.name;
}

['identifyFileInput', 'diagnoseFileInput'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => handleFileSelect(e, id.replace('FileInput', '')));
});

function handleFileSelect(event, type) {
    const file = event.target.files[0];
    const fileNameSpan = document.getElementById(`${type}FileName`);
    if (file) {
        if (file.size > 4 * 1024 * 1024) {
            alert('File size exceeds 4MB limit. Please choose a smaller file.');
            event.target.value = '';
            fileNameSpan.textContent = 'No file chosen';
        } else {
            fileNameSpan.textContent = file.name;
        }
    } else {
        fileNameSpan.textContent = 'No file chosen';
    }
}

async function analyzeImage(type, maxRetries = 3) {
    const fileInput = document.getElementById(`${type}FileInput`);
    const cameraInput = document.getElementById(`${type}CameraInput`);
    const loadingDiv = document.getElementById('loading');
    const analysisInfoDiv = document.getElementById('analysisInfo');

    let file;
    if (fileInput.files.length > 0) {
        file = fileInput.files[0];
    } else if (cameraInput.files.length > 0) {
        file = cameraInput.files[0];
    }

    if (!file) {
        analysisInfoDiv.innerHTML = '<p class="error">Please upload an image first.</p>';
        return;
    }

    loadingDiv.style.display = 'block';
    analysisInfoDiv.innerHTML = '';
    const stopLoadingMessage = updateLoadingMessage();

    try {
        const base64Data = await getResizedBase64(file, 600);

        if (!base64Data || base64Data.length === 0) {
            throw new Error('Invalid image data');
        }

        const prompt = type === 'identify' 
            ? "Analyze this plant image. Provide the plant's common name, scientific name, and key characteristics. Format: Common Name (Scientific Name) - Key Characteristics."
            : "Analyze this plant for diseases. Identify visible diseases or pests. Format: Disease Name - Key Symptoms - Quick Treatment.";

        let retryCount = 0;
        let retryDelay = 1000; // Start with a 1 second delay

        while (retryCount < maxRetries) {
            try {
                await apiThrottle.throttle();
                console.log('Sending API request...');
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const response = await fetch(`${API_URL}?key=${API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { 
                                    inline_data: { 
                                        mime_type: file.type,
                                        data: base64Data
                                    }
                                }
                            ]
                        }]
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                console.log('API response status:', response.status);

                if (response.status === 429) {
                    console.log(`Rate limit exceeded. Retrying in ${retryDelay / 1000} seconds.`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    retryDelay *= 2; // Exponential backoff
                    retryCount++;
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json();
                console.log('API Response:', responseData);

                const analysis = validateApiResponse(responseData);
                console.log('Validated analysis:', analysis);

                const formattedAnalysis = formatAnalysis(type, analysis);
                console.log('Formatted analysis:', formattedAnalysis);

                animateResult();
                analysisInfoDiv.innerHTML = formattedAnalysis;
                return;
            } catch (error) {
                console.error(`Attempt ${retryCount + 1} failed:`, error);
                if (error.name === 'AbortError') {
                    console.log('Request timed out');
                    break;
                }
                if (retryCount === maxRetries - 1) {
                    throw error;
                }
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 2; // Exponential backoff
            }
        }
        throw new Error('Max retry attempts reached');
    } catch (error) {
        console.error('Final Error:', error);
        animateResult();
        const fallbackAnalysis = getFallbackAnalysis(type);
        analysisInfoDiv.innerHTML = `
            <p class="error">We're sorry, but we couldn't analyze your image at this time. Our system is currently experiencing high traffic.</p>
            <p>Please try again in a few minutes. In the meantime, here's a sample analysis from our database:</p>
            ${fallbackAnalysis}
            <p>Please note: This is a general analysis and may not accurately reflect your specific plant. For the most accurate results, please try again later when our system is less busy.</p>
        `;
        shakeElement('analysisInfo');
    } finally {
        stopLoadingMessage();
        loadingDiv.style.display = 'none';
    }
}

const commonPlantLocations = {
    "Snake Plant": "Native to tropical West Africa, commonly found in households worldwide. Particularly popular in North America, Europe, and Asia.",
    "Aloe Vera": "Native to the Arabian Peninsula, now cultivated globally. Common in Mediterranean climates and as a houseplant worldwide.",
    "Spider Plant": "Native to tropical and southern Africa, popular as a houseplant in North America, Europe, and Australia.",
    "Peace Lily": "Native to tropical regions of the Americas and southeastern Asia, common in homes and offices worldwide.",
    "Pothos": "Native to the Solomon Islands, popular in homes and offices across North America, Europe, and Asia.",
    // Add more common plants as needed
};

function formatAnalysis(type, analysis) {
    try {
        if (typeof analysis !== 'string') {
            throw new Error('Invalid analysis format');
        }

        let formattedResult = '';
        let plantName = '';
        let commonName = '';
        let disease = '';

        if (type === 'identify') {
            const match = analysis.match(/\*\*(.*?)\*\*\s*-\s*(.*)/);
            if (match) {
                const [, name, description] = match;
                [commonName, scientificName] = name.split('(').map(part => part.trim().replace(')', ''));
                plantName = commonName;
                
                formattedResult = `
                    <h2>${commonName}</h2>
                    <p><strong>Scientific Name:</strong> ${scientificName}</p>
                    <p><strong>Description:</strong> ${description.trim()}</p>
                `;
            } else {
                formattedResult = `
                    <h2>Plant Identification</h2>
                    <p>${analysis}</p>
                `;
            }
        } else {
            const parts = analysis.split(/\s*-\s*/);
            if (parts.length >= 3) {
                [disease, symptoms, treatment] = parts;
                plantName = disease;
                formattedResult = `
                    <h2>${disease}</h2>
                    <p><strong>Key Symptoms:</strong> ${symptoms}</p>
                    <p><strong>Quick Treatment:</strong> ${treatment}</p>
                `;
            } else {
                formattedResult = `<p>${analysis}</p>`;
            }
        }
        
        // Add plant care tips
        const careTips = getPlantCareTips(plantName);
        const careTipsHtml = `
            <div id="careTips">
                <h3>Plant Care Tips</h3>
                <ul id="careTipsList">
                    ${careTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;

        return formattedResult + careTipsHtml;
    } catch (error) {
        console.error('Error formatting analysis:', error);
        return `<p>${analysis}</p>`;
    }
}

function getFallbackAnalysis(type) {
    return getDetailedFallbackAnalysis(type);
}

function getDetailedFallbackAnalysis(type) {
    const data = fallbackData[type];
    const randomIndex = Math.floor(Math.random() * data.length);
    const item = data[randomIndex];
    
    if (type === 'identify') {
        // Add more detailed sample locations for each plant in the fallback data
        const locations = {
            "Sunflower": "Open, sunny areas across North and South America. Particularly common in the Great Plains of the United States, as well as in Ukraine and Russia.",
            "Rose": "Gardens worldwide, with species native to various regions. For example, Rosa gallica is native to southern and central Europe, while Rosa chinensis originates from China and Burma.",
            "Lavender": "Mediterranean regions, especially in France (Provence), Spain, and England. Also cultivated in Australia, New Zealand, and the United States (California and Texas).",
            "Tulip": "Originally from Central Asia, including countries like Kazakhstan and Kyrgyzstan. Now widely cultivated in the Netherlands, which is famous for its tulip fields.",
            "Orchid": "Diverse habitats worldwide, from tropical rainforests in South America and Southeast Asia to alpine meadows in Europe. Specific species are endemic to particular regions, such as Vanda coerulea in northeastern India and Myanmar."
        };
        const [commonName, scientificName] = item.name.split('(');
        const location = locations[commonName.trim()] || "Various regions depending on the species and cultivation";
        
        return `
            <h2>Plant Name</h2>
            <p>${commonName.trim()}</p>
            <h3>Scientific Name</h3>
            <p>${scientificName.replace(')', '')}</p>
            <h3>Plant Details</h3>
            <p><strong>Key Characteristics:</strong> ${item.characteristics}</p>
            <h3>Plant Location</h3>
            <p>${location}</p>
            <p><strong>Additional Info:</strong> This plant is commonly found in gardens and is known for its beauty and ease of care.</p>
        `;
    } else {
        // Keep the disease diagnosis format as is
        return `
            <h2>${item.disease}</h2>
            <p><strong>Key Symptoms:</strong> ${item.symptoms}</p>
            <p><strong>Quick Treatment:</strong> ${item.treatment}</p>
            <p><strong>Prevention:</strong> Maintain good plant hygiene, ensure proper watering, and provide adequate air circulation to prevent future occurrences.</p>
        `;
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
        button.style.transform = 'translateY(0)';
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    const activeButton = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
    activeButton.classList.add('active');
    activeButton.style.transform = 'translateY(-3px)';
    const activeContent = document.getElementById(`${tabName}Tab`);
    activeContent.classList.add('active');
    activeContent.style.display = 'block';
    activeContent.style.animation = 'fadeIn 0.5s ease';
}

async function getResizedBase64(file, maxSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let [width, height] = [img.width, img.height];
            if (width > height) {
                if (width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }
            [canvas.width, canvas.height] = [width, height];
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL(file.type).split(',')[1]);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

['identifyFileInput', 'diagnoseFileInput'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
        const file = e.target.files[0];
        const type = id.replace('FileInput', '');
        const fileNameSpan = document.getElementById(`${type}FileName`);
        if (file) {
            if (file.size > 4 * 1024 * 1024) {
                alert('File size exceeds 4MB limit. Please choose a smaller file.');
                e.target.value = '';
                fileNameSpan.textContent = 'No file chosen';
            } else {
                fileNameSpan.textContent = file.name;
            }
        } else {
            fileNameSpan.textContent = 'No file chosen';
        }
    });
});

function updateLoadingMessage() {
    let dots = '';
    let seconds = 0;
    const loadingDiv = document.getElementById('loading');
    const interval = setInterval(() => {
        dots = dots.length < 3 ? dots + '.' : '';
        seconds++;
        loadingDiv.innerHTML = `
            <div class="spinner"></div>
            <p>Analyzing image${dots}</p>
            <p>This may take up to 60 seconds. Time elapsed: ${seconds} seconds</p>
        `;
        if (seconds >= 60) {
            clearInterval(interval);
        }
    }, 1000);
    return () => clearInterval(interval);
}

function validateApiResponse(responseData) {
    if (!responseData || typeof responseData !== 'object') {
        throw new Error('Invalid API response format');
    }
    if (!Array.isArray(responseData.candidates) || responseData.candidates.length === 0) {
        throw new Error('No analysis candidates in the response');
    }
    const candidate = responseData.candidates[0];
    if (!candidate.content || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
        throw new Error('Invalid content format in API response');
    }
    const text = candidate.content.parts[0].text;
    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Empty or invalid analysis text');
    }
    return text;
}

function animateResult() {
    const result = document.getElementById('result');
    result.style.display = 'none';
    gsap.to(result, {duration: 0.5, display: 'block', opacity: 1, y: 0, ease: 'power3.out'});
}

function shakeElement(elementId) {
    const element = document.getElementById(elementId);
    gsap.to(element, {duration: 0.1, x: 10, repeat: 5, yoyo: true, ease: 'power1.inOut'});
}

// Add this at the end of your script.js file

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    animateElements();
    initDarkMode();
    initAccessibility();
});

function initParticles() {
    particlesJS('particles', {
        particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: "#ffffff" },
            shape: { type: "circle", stroke: { width: 0, color: "#000000" }, polygon: { nb_sides: 5 } },
            opacity: { value: 0.5, random: false, anim: { enable: false, speed: 1, opacity_min: 0.1, sync: false } },
            size: { value: 3, random: true, anim: { enable: false, speed: 40, size_min: 0.1, sync: false } },
            line_linked: { enable: true, distance: 150, color: "#ffffff", opacity: 0.4, width: 1 },
            move: { enable: true, speed: 6, direction: "none", random: false, straight: false, out_mode: "out", bounce: false, attract: { enable: false, rotateX: 600, rotateY: 1200 } }
        },
        interactivity: {
            detect_on: "canvas",
            events: { onhover: { enable: true, mode: "repulse" }, onclick: { enable: true, mode: "push" }, resize: true },
            modes: { grab: { distance: 400, line_linked: { opacity: 1 } }, bubble: { distance: 400, size: 40, duration: 2, opacity: 8, speed: 3 }, repulse: { distance: 200, duration: 0.4 }, push: { particles_nb: 4 }, remove: { particles_nb: 2 } }
        },
        retina_detect: true
    });
}

function animateElements() {
    gsap.from('.container', {duration: 1, y: 50, opacity: 0, ease: 'power3.out'});
    gsap.from('h1', {duration: 1, y: -50, opacity: 0, ease: 'power3.out', delay: 0.5});
    gsap.from('.tab-button', {duration: 0.5, scale: 0.5, opacity: 0, ease: 'back.out(1.7)', stagger: 0.2, delay: 1});

function formatAnalysis(type, analysis) {
    try {
        if (typeof analysis !== 'string') {
            throw new Error('Invalid analysis format');
        }

        let formattedResult = '';
        let plantName = '';
        let commonName = '';
        let disease = '';

        if (type === 'identify') {
            const match = analysis.match(/\*\*(.*?)\*\*\s*-\s*(.*)/);
            if (match) {
                const [, name, description] = match;
                [commonName, scientificName] = name.split('(').map(part => part.trim().replace(')', ''));
                plantName = commonName;
                
                formattedResult = `
                    <h2>${commonName}</h2>
                    <p><strong>Scientific Name:</strong> ${scientificName}</p>
                    <p><strong>Description:</strong> ${description.trim()}</p>
                `;
            } else {
                formattedResult = `
                    <h2>Plant Identification</h2>
                    <p>${analysis}</p>
                `;
            }
        } else {
            const parts = analysis.split(/\s*-\s*/);
            if (parts.length >= 3) {
                [disease, symptoms, treatment] = parts;
                plantName = disease;
                formattedResult = `
                    <h2>${disease}</h2>
                    <p><strong>Key Symptoms:</strong> ${symptoms}</p>
                    <p><strong>Quick Treatment:</strong> ${treatment}</p>
                `;
            } else {
                formattedResult = `<p>${analysis}</p>`;
            }
        }
        
        // Add plant care tips
        const careTips = getPlantCareTips(plantName);
        const careTipsHtml = `
            <div id="careTips">
                <h3>Plant Care Tips</h3>
                <ul id="careTipsList">
                    ${careTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;

        return formattedResult + careTipsHtml;
    } catch (error) {
        console.error('Error formatting analysis:', error);
        return `<p>${analysis}</p>`;
    }
}

function getFallbackAnalysis(type) {
    return getDetailedFallbackAnalysis(type);
}

function getDetailedFallbackAnalysis(type) {
    const data = fallbackData[type];
    const randomIndex = Math.floor(Math.random() * data.length);
    const item = data[randomIndex];
    
    if (type === 'identify') {
        // Add more detailed sample locations for each plant in the fallback data
        const locations = {
            "Sunflower": "Open, sunny areas across North and South America. Particularly common in the Great Plains of the United States, as well as in Ukraine and Russia.",
            "Rose": "Gardens worldwide, with species native to various regions. For example, Rosa gallica is native to southern and central Europe, while Rosa chinensis originates from China and Burma.",
            "Lavender": "Mediterranean regions, especially in France (Provence), Spain, and England. Also cultivated in Australia, New Zealand, and the United States (California and Texas).",
            "Tulip": "Originally from Central Asia, including countries like Kazakhstan and Kyrgyzstan. Now widely cultivated in the Netherlands, which is famous for its tulip fields.",
            "Orchid": "Diverse habitats worldwide, from tropical rainforests in South America and Southeast Asia to alpine meadows in Europe. Specific species are endemic to particular regions, such as Vanda coerulea in northeastern India and Myanmar."
        };
        const [commonName, scientificName] = item.name.split('(');
const API_KEY = 'AIzaSyBs8VIj2Y0smjU4OtJDPFUBVV1mmHOWYgQ'; // Updated API key
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';
const fallbackData = {
    identify: [
        { name: "Sunflower (Helianthus annuus)", characteristics: "Tall annual with large yellow flower heads" },
        { name: "Rose (Rosa spp.)", characteristics: "Woody perennial with fragrant flowers in various colors" },
        { name: "Lavender (Lavandula)", characteristics: "Aromatic shrub with purple flower spikes" },
        { name: "Tulip (Tulipa)", characteristics: "Spring-blooming bulbous plant with cup-shaped flowers" },
        { name: "Orchid (Orchidaceae)", characteristics: "Diverse family of flowering plants with complex blooms" }
    ],
    diagnose: [
        { disease: "Powdery Mildew", symptoms: "White powdery spots on leaves", treatment: "Apply fungicide and improve air circulation" },
        { disease: "Aphid Infestation", symptoms: "Clusters of small insects on stems and leaves", treatment: "Use insecticidal soap or neem oil" },
        { disease: "Root Rot", symptoms: "Wilting, yellowing leaves and soft, brown roots", treatment: "Improve drainage and reduce watering" },
        { disease: "Leaf Spot", symptoms: "Brown or black spots on leaves", treatment: "Remove affected leaves and apply fungicide" },
        { disease: "Spider Mites", symptoms: "Tiny specks on leaves, fine webbing", treatment: "Increase humidity and use miticide if severe" }
    ]
};

const apiThrottle = {
    lastCallTime: 0,
    minInterval: 1000, // Minimum time between API calls in milliseconds
    async throttle() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;
        if (timeSinceLastCall < this.minInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
        }
        this.lastCallTime = Date.now();
    }
};

function openGallery(type) {
    document.getElementById(`${type}FileInput`).click();
}

function openCamera(type) {
    const cameraWindow = window.open('', '_blank', 'width=600,height=400');
    cameraWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Take Photo</title>
            <style>
                body { margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #000; }
                #video { width: 100%; max-width: 600px; }
                #captureButton { margin-top: 20px; padding: 10px 20px; font-size: 18px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
            </style>
        </head>
        <body>
            <video id="video" autoplay playsinline></video>
            <button id="captureButton">Capture Photo</button>
            <canvas id="canvas" style="display:none;"></canvas>
            <script>
                const video = document.getElementById('video');
                const canvas = document.getElementById('canvas');
                const captureButton = document.getElementById('captureButton');

                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                    .then(stream => {
                        video.srcObject = stream;
                    })
                    .catch(error => {
                        console.error('Error accessing camera:', error);
                        window.close();
                    });

                captureButton.addEventListener('click', () => {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    canvas.toBlob(blob => {
                        const file = new File([blob], "camera_photo.jpg", { type: "image/jpeg" });
                        window.opener.handleCapturedImage('${type}', file);
                        window.close();
                    }, 'image/jpeg');
                });
            </script>
        </body>
        </html>
    `);
}

function handleCapturedImage(type, file) {
    const fileInput = document.getElementById(`${type}FileInput`);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    
    // Update the file name display
    document.getElementById(`${type}FileName`).textContent = file.name;
}

['identifyFileInput', 'diagnoseFileInput'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => handleFileSelect(e, id.replace('FileInput', '')));
});

function handleFileSelect(event, type) {
    const file = event.target.files[0];
    const fileNameSpan = document.getElementById(`${type}FileName`);
    if (file) {
        if (file.size > 4 * 1024 * 1024) {
            alert('File size exceeds 4MB limit. Please choose a smaller file.');
            event.target.value = '';
            fileNameSpan.textContent = 'No file chosen';
        } else {
            fileNameSpan.textContent = file.name;
        }
    } else {
        fileNameSpan.textContent = 'No file chosen';
    }
}

async function analyzeImage(type, maxRetries = 3) {
    const fileInput = document.getElementById(`${type}FileInput`);
    const cameraInput = document.getElementById(`${type}CameraInput`);
    const loadingDiv = document.getElementById('loading');
    const analysisInfoDiv = document.getElementById('analysisInfo');

    let file;
    if (fileInput.files.length > 0) {
        file = fileInput.files[0];
    } else if (cameraInput.files.length > 0) {
        file = cameraInput.files[0];
    }

    if (!file) {
        analysisInfoDiv.innerHTML = '<p class="error">Please upload an image first.</p>';
        return;
    }

    loadingDiv.style.display = 'block';
    analysisInfoDiv.innerHTML = '';
    const stopLoadingMessage = updateLoadingMessage();

    try {
        const base64Data = await getResizedBase64(file, 600);

        if (!base64Data || base64Data.length === 0) {
            throw new Error('Invalid image data');
        }

        const prompt = type === 'identify' 
            ? "Analyze this plant image. Provide the plant's common name, scientific name, and key characteristics. Format: Common Name (Scientific Name) - Key Characteristics."
            : "Analyze this plant for diseases. Identify visible diseases or pests. Format: Disease Name - Key Symptoms - Quick Treatment.";

        let retryCount = 0;
        let retryDelay = 1000; // Start with a 1 second delay

        while (retryCount < maxRetries) {
            try {
                await apiThrottle.throttle();
                console.log('Sending API request...');
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const response = await fetch(`${API_URL}?key=${API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { 
                                    inline_data: { 
                                        mime_type: file.type,
                                        data: base64Data
                                    }
                                }
                            ]
                        }]
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                console.log('API response status:', response.status);

                if (response.status === 429) {
                    console.log(`Rate limit exceeded. Retrying in ${retryDelay / 1000} seconds.`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    retryDelay *= 2; // Exponential backoff
                    retryCount++;
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json();
                console.log('API Response:', responseData);

                const analysis = validateApiResponse(responseData);
                console.log('Validated analysis:', analysis);

                const formattedAnalysis = formatAnalysis(type, analysis);
                console.log('Formatted analysis:', formattedAnalysis);

                animateResult();
                analysisInfoDiv.innerHTML = formattedAnalysis;
                return;
            } catch (error) {
                console.error(`Attempt ${retryCount + 1} failed:`, error);
                if (error.name === 'AbortError') {
                    console.log('Request timed out');
                    break;
                }
                if (retryCount === maxRetries - 1) {
                    throw error;
                }
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 2; // Exponential backoff
            }
        }
        throw new Error('Max retry attempts reached');
    } catch (error) {
        console.error('Final Error:', error);
        animateResult();
        const fallbackAnalysis = getFallbackAnalysis(type);
        analysisInfoDiv.innerHTML = `
            <p class="error">We're sorry, but we couldn't analyze your image at this time. Our system is currently experiencing high traffic.</p>
            <p>Please try again in a few minutes. In the meantime, here's a sample analysis from our database:</p>
            ${fallbackAnalysis}
            <p>Please note: This is a general analysis and may not accurately reflect your specific plant. For the most accurate results, please try again later when our system is less busy.</p>
        `;
        shakeElement('analysisInfo');
    } finally {
        stopLoadingMessage();
        loadingDiv.style.display = 'none';
    }
}

const commonPlantLocations = {
    "Snake Plant": "Native to tropical West Africa, commonly found in households worldwide. Particularly popular in North America, Europe, and Asia.",
    "Aloe Vera": "Native to the Arabian Peninsula, now cultivated globally. Common in Mediterranean climates and as a houseplant worldwide.",
    "Spider Plant": "Native to tropical and southern Africa, popular as a houseplant in North America, Europe, and Australia.",
    "Peace Lily": "Native to tropical regions of the Americas and southeastern Asia, common in homes and offices worldwide.",
    "Pothos": "Native to the Solomon Islands, popular in homes and offices across North America, Europe, and Asia.",
    // Add more common plants as needed
};

function formatAnalysis(type, analysis) {
    try {
        if (typeof analysis !== 'string') {
            throw new Error('Invalid analysis format');
        }

        let formattedResult = '';
        let plantName = '';
        let commonName = '';
        let disease = '';

        if (type === 'identify') {
            const match = analysis.match(/\*\*(.*?)\*\*\s*-\s*(.*)/);
            if (match) {
                const [, name, description] = match;
                [commonName, scientificName] = name.split('(').map(part => part.trim().replace(')', ''));
                plantName = commonName;
                
                formattedResult = `
                    <h2>${commonName}</h2>
                    <p><strong>Scientific Name:</strong> ${scientificName}</p>
                    <p><strong>Description:</strong> ${description.trim()}</p>
                `;
            } else {
                formattedResult = `
                    <h2>Plant Identification</h2>
                    <p>${analysis}</p>
                `;
            }
        } else {
            const parts = analysis.split(/\s*-\s*/);
            if (parts.length >= 3) {
                [disease, symptoms, treatment] = parts;
                plantName = disease;
                formattedResult = `
                    <h2>${disease}</h2>
                    <p><strong>Key Symptoms:</strong> ${symptoms}</p>
                    <p><strong>Quick Treatment:</strong> ${treatment}</p>
                `;
            } else {
                formattedResult = `<p>${analysis}</p>`;
            }
        }
        
        // Add plant care tips
        const careTips = getPlantCareTips(plantName);
        const careTipsHtml = `
            <div id="careTips">
                <h3>Plant Care Tips</h3>
                <ul id="careTipsList">
                    ${careTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;

        return formattedResult + careTipsHtml;
    } catch (error) {
        console.error('Error formatting analysis:', error);
        return `<p>${analysis}</p>`;
    }
}

function getFallbackAnalysis(type) {
    return getDetailedFallbackAnalysis(type);
}

function getDetailedFallbackAnalysis(type) {
    const data = fallbackData[type];
    const randomIndex = Math.floor(Math.random() * data.length);
    const item = data[randomIndex];
    
    if (type === 'identify') {
        // Add more detailed sample locations for each plant in the fallback data
        const locations = {
            "Sunflower": "Open, sunny areas across North and South America. Particularly common in the Great Plains of the United States, as well as in Ukraine and Russia.",
            "Rose": "Gardens worldwide, with species native to various regions. For example, Rosa gallica is native to southern and central Europe, while Rosa chinensis originates from China and Burma.",
            "Lavender": "Mediterranean regions, especially in France (Provence), Spain, and England. Also cultivated in Australia, New Zealand, and the United States (California and Texas).",
            "Tulip": "Originally from Central Asia, including countries like Kazakhstan and Kyrgyzstan. Now widely cultivated in the Netherlands, which is famous for its tulip fields.",
            "Orchid": "Diverse habitats worldwide, from tropical rainforests in South America and Southeast Asia to alpine meadows in Europe. Specific species are endemic to particular regions, such as Vanda coerulea in northeastern India and Myanmar."
        };
        const [commonName, scientificName] = item.name.split('(');
        const location = locations[commonName.trim()] || "Various regions depending on the species and cultivation";
        
        return `
            <h2>Plant Name</h2>
            <p>${commonName.trim()}</p>
            <h3>Scientific Name</h3>
            <p>${scientificName.replace(')', '')}</p>
            <h3>Plant Details</h3>
            <p><strong>Key Characteristics:</strong> ${item.characteristics}</p>
            <h3>Plant Location</h3>
            <p>${location}</p>
            <p><strong>Additional Info:</strong> This plant is commonly found in gardens and is known for its beauty and ease of care.</p>
        `;
    } else {
        // Keep the disease diagnosis format as is
        return `
            <h2>${item.disease}</h2>
            <p><strong>Key Symptoms:</strong> ${item.symptoms}</p>
            <p><strong>Quick Treatment:</strong> ${item.treatment}</p>
            <p><strong>Prevention:</strong> Maintain good plant hygiene, ensure proper watering, and provide adequate air circulation to prevent future occurrences.</p>
        `;
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
        button.style.transform = 'translateY(0)';
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    const activeButton = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
    activeButton.classList.add('active');
    activeButton.style.transform = 'translateY(-3px)';
    const activeContent = document.getElementById(`${tabName}Tab`);
    activeContent.classList.add('active');
    activeContent.style.display = 'block';
    activeContent.style.animation = 'fadeIn 0.5s ease';
}

async function getResizedBase64(file, maxSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let [width, height] = [img.width, img.height];
            if (width > height) {
                if (width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }
            [canvas.width, canvas.height] = [width, height];
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL(file.type).split(',')[1]);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

['identifyFileInput', 'diagnoseFileInput'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
        const file = e.target.files[0];
        const type = id.replace('FileInput', '');
        const fileNameSpan = document.getElementById(`${type}FileName`);
        if (file) {
            if (file.size > 4 * 1024 * 1024) {
                alert('File size exceeds 4MB limit. Please choose a smaller file.');
                e.target.value = '';
                fileNameSpan.textContent = 'No file chosen';
            } else {
                fileNameSpan.textContent = file.name;
            }
        } else {
            fileNameSpan.textContent = 'No file chosen';
        }
    });
});

function updateLoadingMessage() {
    let dots = '';
    let seconds = 0;
    const loadingDiv = document.getElementById('loading');
    const interval = setInterval(() => {
        dots = dots.length < 3 ? dots + '.' : '';
        seconds++;
        loadingDiv.innerHTML = `
            <div class="spinner"></div>
            <p>Analyzing image${dots}</p>
            <p>This may take up to 60 seconds. Time elapsed: ${seconds} seconds</p>
        `;
        if (seconds >= 60) {
            clearInterval(interval);
        }
    }, 1000);
    return () => clearInterval(interval);
}

function validateApiResponse(responseData) {
    if (!responseData || typeof responseData !== 'object') {
        throw new Error('Invalid API response format');
    }
    if (!Array.isArray(responseData.candidates) || responseData.candidates.length === 0) {
        throw new Error('No analysis candidates in the response');
    }
    const candidate = responseData.candidates[0];
    if (!candidate.content || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
        throw new Error('Invalid content format in API response');
    }
    const text = candidate.content.parts[0].text;
    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Empty or invalid analysis text');
    }
    return text;
}

function animateResult() {
    const result = document.getElementById('result');
    result.style.display = 'none';
    gsap.to(result, {duration: 0.5, display: 'block', opacity: 1, y: 0, ease: 'power3.out'});
}

function shakeElement(elementId) {
    const element = document.getElementById(elementId);
    gsap.to(element, {duration: 0.1, x: 10, repeat: 5, yoyo: true, ease: 'power1.inOut'});
}

// Add this at the end of your script.js file

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    animateElements();
    initDarkMode();
    initAccessibility();
});

function initParticles() {
    particlesJS('particles', {
        particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: "#ffffff" },
            shape: { type: "circle", stroke: { width: 0, color: "#000000" }, polygon: { nb_sides: 5 } },
            opacity: { value: 0.5, random: false, anim: { enable: false, speed: 1, opacity_min: 0.1, sync: false } },
            size: { value: 3, random: true, anim: { enable: false, speed: 40, size_min: 0.1, sync: false } },
            line_linked: { enable: true, distance: 150, color: "#ffffff", opacity: 0.4, width: 1 },
            move: { enable: true, speed: 6, direction: "none", random: false, straight: false, out_mode: "out", bounce: false, attract: { enable: false, rotateX: 600, rotateY: 1200 } }
        },
        interactivity: {
            detect_on: "canvas",
            events: { onhover: { enable: true, mode: "repulse" }, onclick: { enable: true, mode: "push" }, resize: true },
            modes: { grab: { distance: 400, line_linked: { opacity: 1 } }, bubble: { distance: 400, size: 40, duration: 2, opacity: 8, speed: 3 }, repulse: { distance: 200, duration: 0.4 }, push: { particles_nb: 4 }, remove: { particles_nb: 2 } }
        },
        retina_detect: true
    });
}

function animateElements() {
    gsap.from('.container', {duration: 1, y: 50, opacity: 0, ease: 'power3.out'});
    gsap.from('h1', {duration: 1, y: -50, opacity: 0, ease: 'power3.out', delay: 0.5});
    gsap.from('.tab-button', {duration: 0.5, scale: 0.5, opacity: 0, ease: 'back.out(1.7)', stagger: 0.2, delay: 1});

function formatAnalysis(type, analysis) {
    try {
        if (typeof analysis !== 'string') {
            throw new Error('Invalid analysis format');
        }

        let formattedResult = '';
        let plantName = '';
        let commonName = '';
        let disease = '';

        if (type === 'identify') {
            const match = analysis.match(/\*\*(.*?)\*\*\s*-\s*(.*)/);
            if (match) {
                const [, name, description] = match;
                [commonName, scientificName] = name.split('(').map(part => part.trim().replace(')', ''));
                plantName = commonName;
                
                formattedResult = `
                    <h2>${commonName}</h2>
                    <p><strong>Scientific Name:</strong> ${scientificName}</p>
                    <p><strong>Description:</strong> ${description.trim()}</p>
                `;
            } else {
                formattedResult = `
                    <h2>Plant Identification</h2>
                    <p>${analysis}</p>
                `;
            }
        } else {
            const parts = analysis.split(/\s*-\s*/);
            if (parts.length >= 3) {
                [disease, symptoms, treatment] = parts;
                plantName = disease;
                formattedResult = `
                    <h2>${disease}</h2>
                    <p><strong>Key Symptoms:</strong> ${symptoms}</p>
                    <p><strong>Quick Treatment:</strong> ${treatment}</p>
                `;
            } else {
                formattedResult = `<p>${analysis}</p>`;
            }
        }
        
        // Add plant care tips
        const careTips = getPlantCareTips(plantName);
        const careTipsHtml = `
            <div id="careTips">
                <h3>Plant Care Tips</h3>
                <ul id="careTipsList">
                    ${careTips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;

        return formattedResult + careTipsHtml;
    } catch (error) {
        console.error('Error formatting analysis:', error);
        return `<p>${analysis}</p>`;
    }
}

function getFallbackAnalysis(type) {
    return getDetailedFallbackAnalysis(type);
}

function getDetailedFallbackAnalysis(type) {
    const data = fallbackData[type];
    const randomIndex = Math.floor(Math.random() * data.length);
    const item = data[randomIndex];
    
    if (type === 'identify') {
        // Add more detailed sample locations for each plant in the fallback data
        const locations = {
            "Sunflower": "Open, sunny areas across North and South America. Particularly common in the Great Plains of the United States, as well as in Ukraine and Russia.",
            "Rose": "Gardens worldwide, with species native to various regions. For example, Rosa gallica is native to southern and central Europe, while Rosa chinensis originates from China and Burma.",
            "Lavender": "Mediterranean regions, especially in France (Provence), Spain, and England. Also cultivated in Australia, New Zealand, and the United States (California and Texas).",
            "Tulip": "Originally from Central Asia, including countries like Kazakhstan and Kyrgyzstan. Now widely cultivated in the Netherlands, which is famous for its tulip fields.",
            "Orchid": "Diverse habitats worldwide, from tropical rainforests in South America and Southeast Asia to alpine meadows in Europe. Specific species are endemic to particular regions, such as Vanda coerulea in northeastern India and Myanmar."
        };
        const [commonName, scientificName] = item.name.split('(');
        const location = locations[commonName.trim()] || "Various regions depending on the species and cultivation";
        
        return `
            <h2>Plant Name</h2>
            <p>${commonName.trim()}</p>
            <h3>Scientific Name</h3>
            <p>${scientificName.replace(')', '')}</p>
            <h3>Plant Details</h3>
            <p><strong>Key Characteristics:</strong> ${item.characteristics}</p>
            <h3>Plant Location</h3>
            <p>${location}</p>
            <p><strong>Additional Info:</strong> This plant is commonly found in gardens and is known for its beauty and ease of care.</p>
        `;
    } else {
        // Keep the disease diagnosis format as is
        return `
            <h2>${item.disease}</h2>
            <p><strong>Key Symptoms:</strong> ${item.symptoms}</p>
            <p><strong>Quick Treatment:</strong> ${item.treatment}</p>
            <p><strong>Prevention:</strong> Maintain good plant hygiene, ensure proper watering, and provide adequate air circulation to prevent future occurrences.</p>
        `;
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
        button.style.transform = 'translateY(0)';
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    const activeButton = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
    activeButton.classList.add('active');
    activeButton.style.transform = 'translateY(-3px)';
    const activeContent = document.getElementById(`${tabName}Tab`);
    activeContent.classList.add('active');
    activeContent.style.display = 'block';
    activeContent.style.animation = 'fadeIn 0.5s ease';
}

async function getResizedBase64(file, maxSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let [width, height] = [img.width, img.height];
            if (width > height) {
                if (width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }
            [canvas.width, canvas.height] = [width, height];
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL(file.type).split(',')[1]);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

['identifyFileInput', 'diagnoseFileInput'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
        const file = e.target.files[0];
        const type = id.replace('FileInput', '');
        const fileNameSpan = document.getElementById(`${type}FileName`);
        if (file) {
            if (file.size > 4 * 1024 * 1024) {
                alert('File size exceeds 4MB limit. Please choose a smaller file.');
                e.target.value = '';
                fileNameSpan.textContent = 'No file chosen';
            } else {
                fileNameSpan.textContent = file.name;
            }
        } else {
            fileNameSpan.textContent = 'No file chosen';
        }
    });
});

function updateLoadingMessage() {
    let dots = '';
    let seconds = 0;
    const loadingDiv = document.getElementById('loading');
    const interval = setInterval(() => {
        dots = dots.length < 3 ? dots + '.' : '';
        seconds++;
        loadingDiv.innerHTML = `
            <div class="spinner"></div>
            <p>Analyzing image${dots}</p>
            <p>This may take up to 60 seconds. Time elapsed: ${seconds} seconds</p>
        `;
        if (seconds >= 60) {
            clearInterval(interval);
        }
    }, 1000);
    return () => clearInterval(interval);
}

function validateApiResponse(responseData) {
    if (!responseData || typeof responseData !== 'object') {
        throw new Error('Invalid API response format');
    }
    if (!Array.isArray(responseData.candidates) || responseData.candidates.length === 0) {
        throw new Error('No analysis candidates in the response');
    }
    const candidate = responseData.candidates[0];
    if (!candidate.content || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
        throw new Error('Invalid content format in API response');
    }
    const text = candidate.content.parts[0].text;
    if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Empty or invalid analysis text');
    }
    return text;
}

function animateResult() {
    const result = document.getElementById('result');
    result.style.display = 'none';
    gsap.to(result, {duration: 0.5, display: 'block', opacity: 1, y: 0, ease: 'power3.out'});
}

function shakeElement(elementId) {
    const element = document.getElementById(elementId);
    gsap.to(element, {duration: 0.1, x: 10, repeat: 5, yoyo: true, ease: 'power1.inOut'});
}

// Add this at the end of your script.js file

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    animateElements();
    initDarkMode();
    initAccessibility();
});

function initParticles() {
    particlesJS('particles', {
        particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: "#ffffff" },
            shape: { type: "circle", stroke: { width: 0, color: "#000000" }, polygon: { nb_sides: 5 } },
            opacity: { value: 0.5, random: false, anim: { enable: false, speed: 1, opacity_min: 0.1, sync: false } },
            size: { value: 3, random: true, anim: { enable: false, speed: 40, size_min: 0.1, sync: false } },
            line_linked: { enable: true, distance: 150, color: "#ffffff", opacity: 0.4, width: 1 },
            move: { enable: true, speed: 6, direction: "none", random: false, straight: false, out_mode: "out", bounce: false, attract: { enable: false, rotateX: 600, rotateY: 1200 } }
        },
        interactivity: {
            detect_on: "canvas",
            events: { onhover: { enable: true, mode: "repulse" }, onclick: { enable: true, mode: "push" }, resize: true },
            modes: { grab: { distance: 400, line_linked: { opacity: 1 } }, bubble: { distance: 400, size: 40, duration: 2, opacity: 8, speed: 3 }, repulse: { distance: 200, duration: 0.4 }, push: { particles_nb: 4 }, remove: { particles_nb: 2 } }
        },
        retina_detect: true
    });
}

function animateElements() {
    gsap.from('.container', {duration: 1, y: 50, opacity: 0, ease: 'power3.out'});
    gsap.from('h1', {duration: 1, y: -50, opacity: 0, ease: 'power3.out', delay: 0.5});
    gsap.from('.tab-button', {duration: 0.5, scale: 0.5, opacity: 0, ease: 'back.out(1.7)', stagger: 0.2, delay: 1});
    
    // Add this line for the creator tribute animation
    gsap.from('.creator-tribute', {duration: 1, opacity: 0, y: 20, ease: 'power3.out', delay: 2});
}

function animateResult() {
    const result = document.getElementById('result');
    result.style.display = 'none';
    gsap.to(result, {duration: 0.5, display: 'block', opacity: 1, y: 0, ease: 'power3.out'});
    
    // Animate result content
    gsap.from('#analysisInfo h2, #analysisInfo h3', {duration: 0.5, y: 20, opacity: 0, ease: 'power3.out', stagger: 0.2, delay: 0.2});
    gsap.from('#analysisInfo p', {duration: 0.5, x: -20, opacity: 0, ease: 'power3.out', stagger: 0.1, delay: 0.5});
}

function shakeElement(elementId) {
    const element = document.getElementById(elementId);
    gsap.to(element, {duration: 0.1, x: 10, repeat: 5, yoyo: true, ease: 'power1.inOut'});
}

// Modify the switchTab function
function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    const activeButton = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
    activeButton.classList.add('active');
    gsap.to(activeButton, {duration: 0.3, scale: 1.1, y: -3, ease: 'power3.out'});
    const activeContent = document.getElementById(`${tabName}Tab`);
    activeContent.classList.add('active');
    gsap.fromTo(activeContent, 
        {display: 'none', opacity: 0, y: 20},
        {duration: 0.5, display: 'block', opacity: 1, y: 0, ease: 'power3.out'}
    );
}

// Modify the updateLoadingMessage function
function updateLoadingMessage() {
    let dots = '';
    let seconds = 0;
    const loadingDiv = document.getElementById('loading');
    const interval = setInterval(() => {
        dots = dots.length < 3 ? dots + '.' : '';
        seconds++;
        gsap.to(loadingDiv, {duration: 0.3, opacity: 1, ease: 'power3.out'});
        loadingDiv.innerHTML = `
            <div class="spinner"></div>
            <p>Analyzing image${dots}</p>
            <p>This may take up to 60 seconds. Time elapsed: ${seconds} seconds</p>
        `;
        if (seconds >= 60) {
            clearInterval(interval);
        }
    }, 1000);
    return () => {
        clearInterval(interval);
        gsap.to(loadingDiv, {duration: 0.3, opacity: 0, ease: 'power3.out'});
    };
}

// Add this function to create a pulsating effect on buttons
function pulsateElement(element) {
    gsap.to(element, {
        duration: 0.5,
        scale: 1.05,
        repeat: -1,
        yoyo: true,
        ease: 'power1.inOut'
    });
}

// Add pulsating effect to analyze buttons
document.querySelectorAll('.analyze-btn').forEach(btn => {
    btn.addEventListener('mouseover', () => pulsateElement(btn));
    btn.addEventListener('mouseout', () => gsap.killTweensOf(btn));
});

// Add a subtle hover effect to the result container
const resultContainer = document.getElementById('result');
resultContainer.addEventListener('mouseover', () => {
    gsap.to(resultContainer, {duration: 0.3, scale: 1.02, ease: 'power3.out'});
});
resultContainer.addEventListener('mouseout', () => {
    gsap.to(resultContainer, {duration: 0.3, scale: 1, ease: 'power3.out'});
});

// Add hover effect to creator's name
document.addEventListener('DOMContentLoaded', () => {
    const creatorName = document.querySelector('.creator-name');
    creatorName.addEventListener('mouseover', () => {
        gsap.to(creatorName, {duration: 0.3, scale: 1.1, color: '#4db6ac', ease: 'power3.out'});
    });
    creatorName.addEventListener('mouseout', () => {
        gsap.to(creatorName, {duration: 0.3, scale: 1, color: '#00796b', ease: 'power3.out'});
    });
});

function initDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const body = document.body;
    
    // Check if dark mode preference is stored
    const isDarkMode = localStorage.getItem('darkMode') === 'true';

    // Set initial state
    if (isDarkMode) {
        body.classList.add('dark-mode');
        darkModeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // Toggle dark mode on button click
    darkModeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        const isDarkModeNow = body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDarkModeNow);
        darkModeToggle.innerHTML = isDarkModeNow ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });
}

function initAccessibility() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', button.classList.contains('active'));
    });

    const fileLabels = document.querySelectorAll('.file-label');
    fileLabels.forEach(label => {
        label.setAttribute('role', 'button');
        label.setAttribute('tabindex', '0');
        label.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                label.click();
            }
        });
    });
}

function getPlantCareTips(plantOrDisease) {
    const generalTips = [
        "Ensure proper watering - not too much, not too little.",
        "Provide adequate sunlight based on the plant's needs.",
        "Use well-draining soil to prevent root rot.",
        "Fertilize regularly during the growing season.",
        "Prune dead or yellowing leaves to promote healthy growth."
    ];

    const specificTips = {
        "Sunflower": ["Plant in full sun", "Water deeply but infrequently"],
        "Rose": ["Prune in early spring", "Protect from harsh winter weather"],
        "Lavender": ["Plant in well-draining soil", "Avoid overwatering"],
        "Tulip": ["Plant bulbs in autumn", "Allow foliage to die back naturally after blooming"],
        "Orchid": ["Maintain high humidity", "Use specialized orchid potting mix"],
        "Powdery Mildew": ["Improve air circulation", "Apply fungicide as needed"],
        "Aphid Infestation": ["Spray plants with water to dislodge aphids", "Introduce natural predators like ladybugs"],
        "Root Rot": ["Ensure proper drainage", "Avoid overwatering"],
        "Leaf Spot": ["Remove and destroy infected leaves", "Avoid overhead watering"],
        "Spider Mites": ["Increase humidity", "Use neem oil or insecticidal soap"]
    };

    const tips = specificTips[plantOrDisease] || [];
    return [...tips, ...generalTips.slice(0, 5 - tips.length)];
}

function updateProgress(percent) {
    const progressBar = document.getElementById('uploadProgress');
    progressBar.style.width = percent + '%';
}

function typeWriter(element, text, speed = 50) {
    let i = 0;
    element.innerHTML = '';
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

function addFloatingLeaves() {
    for (let i = 0; i < 5; i++) {
        let leaf = document.createElement('div');
        leaf.className = 'floating-leaf';
        leaf.style.left = Math.random() * 100 + 'vw';
        leaf.style.top = Math.random() * 100 + 'vh';
        leaf.style.animationDuration = (Math.random() * 10 + 10) + 's';
        document.body.appendChild(leaf);
    }
}

function startAnalysis() {
    document.getElementById('growingPlant').style.animationPlayState = 'running';
    // ... rest of your analysis code ...
}

function displayResults(results) {
    let resultElement = document.getElementById('analysisInfo');
    typeWriter(resultElement, results);
}

// Call these functions at appropriate times in your existing code
addFloatingLeaves();
// Call startAnalysis() when the analyze button is clicked
// Call displayResults() when you receive the analysis results

function showImageSourceOptions(type) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // If the device supports camera access
        const choice = confirm("Choose an image source:\n\nOK - Take a photo\nCancel - Choose from gallery");
        if (choice) {
            // User chose to take a photo
            takePhoto(type);
        } else {
            // User chose to select from gallery
            document.getElementById(`${type}FileInput`).click();
        }
    } else {
        // If the device doesn't support camera access, directly open file picker
        document.getElementById(`${type}FileInput`).click();
    }
}

function takePhoto(type) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function(stream) {
            const video = document.createElement('video');
            video.srcObject = stream;
            video.play();

            video.addEventListener('loadedmetadata', function() {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob(function(blob) {
                    const file = new File([blob], "camera_photo.jpg", { type: "image/jpeg" });
                    handleImageSelect({ target: { files: [file] } }, type);
                    stream.getTracks().forEach(track => track.stop());
                }, 'image/jpeg');
            });
        })
        .catch(function(error) {
            console.error("Error accessing the camera:", error);
            alert("Unable to access the camera. Please choose an image from your gallery.");
            document.getElementById(`${type}FileInput`).click();
        });
}

// Remove functions related to camera and image options
function handleFileSelect(event, type) {
    const file = event.target.files[0];
    const fileNameSpan = document.getElementById(`${type}FileName`);
    if (file) {
        if (file.size > 4 * 1024 * 1024) {
            alert('File size exceeds 4MB limit. Please choose a smaller file.');
            event.target.value = '';
            fileNameSpan.textContent = 'No file chosen';
        } else {
            fileNameSpan.textContent = file.name;
        }
    } else {
        fileNameSpan.textContent = 'No file chosen';
    }
}

// Add event listeners for file inputs
document.getElementById('identifyFileInput').addEventListener('change', (e) => handleFileSelect(e, 'identify'));
document.getElementById('diagnoseFileInput').addEventListener('change', (e) => handleFileSelect(e, 'diagnose'));
