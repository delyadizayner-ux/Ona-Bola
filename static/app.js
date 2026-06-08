// Telegram Mini App Front-End Logic
document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize Telegram WebApp SDK
    const tg = window.Telegram ? window.Telegram.WebApp : null;
    if (tg) {
        tg.ready();
        tg.expand();
        // Set Theme Colors
        tg.setHeaderColor("#FFF9F6");
        tg.setBackgroundColor("#FFF9F6");
    }

    // 2. User State Management
    let currentUser = null;
    let currentChild = null;
    let activeTab = "tab-home";
    
    // Determine user data (Telegram dynamic query or fallbacks for browser testing)
    let initData = tg ? tg.initData : "";
    let telegramId = null;
    let username = "local_user";
    let fullName = "Local Tester";
    let referredBy = null;

    // Check URL parameters for manual/direct browser testing
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("telegram_id")) {
        telegramId = parseInt(urlParams.get("telegram_id"));
        username = urlParams.get("username") || "browser_user";
        fullName = urlParams.get("full_name") || "Browser User";
    }
    if (urlParams.has("start")) {
        referredBy = urlParams.get("start");
    }

    // Try parsing Telegram WebApp user if available
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        telegramId = tg.initDataUnsafe.user.id;
        username = tg.initDataUnsafe.user.username || "";
        fullName = `${tg.initDataUnsafe.user.first_name || ""} ${tg.initDataUnsafe.user.last_name || ""}`.trim();
    }
    
    // In start parameter from Telegram, it can contain ref code
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
        referredBy = tg.initDataUnsafe.start_param;
    }

    // For final fallback in pure local browser
    if (!telegramId) {
        telegramId = 999999; // Mock ID
    }

    // Helper to switch screens
    function showScreen(screenId) {
        document.querySelectorAll(".screen").forEach(s => {
            s.classList.remove("active");
            s.style.display = "none";
        });
        const activeScreen = document.getElementById(screenId);
        // Story viewer uses position:fixed, so use block display for proper scrolling
        activeScreen.style.display = (screenId === "story-viewer-screen") ? "block" : "flex";
        // Scroll to top when switching screens
        activeScreen.scrollTop = 0;
        setTimeout(() => {
            activeScreen.classList.add("active");
        }, 50);

        // Manage WebApp Back Button visibility
        if (tg) {
            if (screenId === "story-viewer-screen") {
                tg.BackButton.show();
                tg.BackButton.onClick(() => {
                    showScreen("dashboard-screen");
                });
            } else {
                tg.BackButton.hide();
            }
        }
    }

    // Trigger haptic vibration if SDK is active
    function triggerHaptic() {
        if (tg && tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred("medium");
        }
    }

    // Show Alert helper
    function showAlert(message) {
        if (tg) {
            tg.showAlert(message);
        } else {
            alert(message);
        }
    }

    // 3. API Calls to Backend

    // User Login
    async function loginUser() {
        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    initData: initData,
                    telegram_id: telegramId,
                    username: username,
                    full_name: fullName,
                    referred_by: referredBy
                })
            });
            const data = await response.json();
            if (data.success) {
                currentUser = data.user;
                currentChild = data.child;
                
                updateUI();
                
                if (data.samples_count) {
                    updateVoiceCloneStatus(data.samples_count);
                }

                if (!currentChild) {
                    // Foydalanuvchi profil to'ldirib o'tirmasligi uchun avtomatik kichkintoy profili yaratamiz
                    currentChild = {
                        name: "Kichkintoy",
                        age: 4,
                        problems: ["behavior"]
                    };
                }
                
                showScreen("dashboard-screen");
                loadDashboardData();
            } else {
                showAlert("Tizimga kirishda xatolik yuz berdi.");
            }
        } catch (e) {
            console.error("Login error:", e);
            showAlert("Tarmoq ulanishida xatolik. Server ishlayotganligini tekshiring.");
        }
    }

    // Update UI elements based on User info
    function updateUI() {
        if (!currentUser) return;

        // Dashboard Top
        document.getElementById("dash-tokens").innerText = currentUser.bonus_tokens;
        
        // Profile Info
        document.getElementById("profile-parent-name").innerText = currentUser.full_name;
        document.getElementById("profile-sub-type").innerText = currentUser.subscription_status === "free" ? "Bepul" : currentUser.subscription_status.toUpperCase();
        document.getElementById("profile-sub-type").className = `badge ${currentUser.subscription_status}`;
        document.getElementById("ref-tokens").innerText = currentUser.bonus_tokens;
        
        // Premium status banner
        const premiumBanner = document.getElementById("premium-status-banner");
        if (currentUser.subscription_status !== "free") {
            premiumBanner.style.display = "block";
            document.getElementById("dash-tokens").innerText = "∞";
        } else {
            premiumBanner.style.display = "none";
        }

        // Referral links
        const botUsername = "OnaBola_bot"; // Change this if bot name differs
        const refLink = `https://t.me/${botUsername}?start=${currentUser.referral_code}`;
        document.getElementById("ref-link-input").value = refLink;

        if (currentChild) {
            document.getElementById("dash-child-name").innerText = `${currentChild.name} Profili`;
            document.getElementById("dash-child-age").innerText = `${currentChild.age} yosh`;
            document.getElementById("profile-child-name").innerText = currentChild.name;
            
            // Populate Problem selector in story generator
            const selectEl = document.getElementById("story-problem-key");
            selectEl.innerHTML = "";
            
            const problemNames = {
                "screentime": "📱 Telefonni ko'p ko'rish",
                "teeth_brush": "🪥 Tish yuvmaslik",
                "food": "🍔 Fast-food / Shirinliklar",
                "bedtime": "🌙 Kech uxlash",
                "behavior": "😠 Ujarlik / Odob-ahloq"
            };

            if (currentChild.problems && currentChild.problems.length > 0) {
                currentChild.problems.forEach(p => {
                    const opt = document.createElement("option");
                    opt.value = p;
                    opt.innerText = problemNames[p] || p;
                    selectEl.appendChild(opt);
                });
            } else {
                // If child profile has no problems checked, show behavior by default
                const opt = document.createElement("option");
                opt.value = "behavior";
                opt.innerText = problemNames["behavior"];
                selectEl.appendChild(opt);
            }
        }
    }

    // 4. Carousel Logic
    let currentSlide = 0;
    const totalSlides = 5;
    const carouselTrack = document.getElementById("carousel-track");
    const dots = document.querySelectorAll(".carousel-dots .dot");
    const nextBtn = document.getElementById("btn-carousel-next");
    const loginBtn = document.getElementById("btn-telegram-login");

    function updateCarousel() {
        // Move track
        carouselTrack.style.transform = `translateX(-${currentSlide * 20}%)`;
        
        // Update dots
        dots.forEach((dot, index) => {
            dot.classList.toggle("active", index === currentSlide);
        });

        // Toggle buttons on last slide
        if (currentSlide === totalSlides - 1) {
            nextBtn.classList.add("hidden");
            loginBtn.classList.remove("hidden");
        } else {
            nextBtn.classList.remove("hidden");
            loginBtn.classList.add("hidden");
        }
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            triggerHaptic();
            if (currentSlide < totalSlides - 1) {
                currentSlide++;
                updateCarousel();
            }
        });
    }

    // Swipe support for Carousel
    let touchStartX = 0;
    let touchEndX = 0;
    
    if (carouselTrack) {
        carouselTrack.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
        }, {passive: true});

        carouselTrack.addEventListener('touchend', e => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, {passive: true});
    }

    function handleSwipe() {
        if (touchEndX < touchStartX - 40) {
            // Swipe Left (Next)
            if (currentSlide < totalSlides - 1) {
                currentSlide++;
                updateCarousel();
                triggerHaptic();
            }
        }
        if (touchEndX > touchStartX + 40) {
            // Swipe Right (Prev)
            if (currentSlide > 0) {
                currentSlide--;
                updateCarousel();
                triggerHaptic();
            }
        }
    }

    if (loginBtn) {
        loginBtn.addEventListener("click", () => {
            triggerHaptic();
            const originalText = loginBtn.innerHTML;
            loginBtn.innerHTML = `<span class="spinner" style="width:16px;height:16px;margin:0 6px 0 0;display:inline-block;vertical-align:middle;border-width:2px;border-top-color:#fff;"></span> Ulanmoqda...`;
            loginBtn.disabled = true;
            loginUser();
        });
    }

    // 4. Tab Navigation Logic
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            triggerHaptic();
            const tabId = btn.getAttribute("data-tab");
            
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById(tabId).classList.add("active");

            activeTab = tabId;
            loadTabContent(tabId);
        });
    });

    function loadDashboardData() {
        loadTabContent("tab-home");
    }

    function loadTabContent(tabId) {
        if (tabId === "tab-home") {
            loadTasksSummary();
        } else if (tabId === "tab-stories") {
            loadStoriesList();
        } else if (tabId === "tab-tasks") {
            loadTasksFull();
        } else if (tabId === "tab-profile") {
            loadReferralStats();
        }
    }

    // Load Tasks Summary for Home
    async function loadTasksSummary() {
        try {
            const res = await fetch(`/api/tasks?telegram_id=${telegramId}`);
            const data = await res.json();
            const tasksList = document.getElementById("home-tasks-list");
            tasksList.innerHTML = "";
            
            let completedCount = 0;
            
            if (data.tasks && data.tasks.length > 0) {
                // Take top 3 tasks for summary
                const topTasks = data.tasks.slice(0, 3);
                topTasks.forEach(task => {
                    if (task.is_completed) completedCount++;
                    
                    const item = document.createElement("div");
                    item.className = `task-item ${task.is_completed ? 'completed' : ''}`;
                    item.innerHTML = `
                        <input type="checkbox" data-id="${task.id}" ${task.is_completed ? 'checked' : ''}>
                        <span>${task.task_name}</span>
                    `;
                    // Checkbox listener
                    item.querySelector("input").addEventListener("change", async (e) => {
                        triggerHaptic();
                        const isChecked = e.target.checked;
                        const taskId = task.id;
                        await toggleTaskStatus(taskId, isChecked);
                        loadTasksSummary();
                    });
                    tasksList.appendChild(item);
                });
                
                // Update stars / points count based on all tasks completed
                const allCompleted = data.tasks.filter(t => t.is_completed).length;
                document.getElementById("home-stars-count").innerText = `⭐ ${allCompleted * 10} ball`;
            } else {
                tasksList.innerHTML = `<p class="empty-text">Bugun uchun topshiriqlar mavjud emas.</p>`;
            }
        } catch (e) {
            console.error("Load tasks summary error:", e);
        }
    }

    // Load Full Tasks Page
    async function loadTasksFull() {
        try {
            const res = await fetch(`/api/tasks?telegram_id=${telegramId}`);
            const data = await res.json();
            const tasksList = document.getElementById("full-tasks-list");
            tasksList.innerHTML = "";
            
            if (data.tasks && data.tasks.length > 0) {
                let completedCount = 0;
                
                data.tasks.forEach(task => {
                    if (task.is_completed) completedCount++;
                    
                    const item = document.createElement("div");
                    item.className = `task-item ${task.is_completed ? 'completed' : ''}`;
                    item.innerHTML = `
                        <input type="checkbox" data-id="${task.id}" ${task.is_completed ? 'checked' : ''}>
                        <span>${task.task_name}</span>
                    `;
                    item.querySelector("input").addEventListener("change", async (e) => {
                        triggerHaptic();
                        const isChecked = e.target.checked;
                        await toggleTaskStatus(task.id, isChecked);
                        loadTasksFull();
                    });
                    tasksList.appendChild(item);
                });

                // Update Progress bar
                const percent = Math.round((completedCount / data.tasks.length) * 100);
                document.getElementById("tasks-progress-fill").style.width = `${percent}%`;
                document.getElementById("tasks-progress-text").innerText = `${percent}% bajarildi`;
            } else {
                tasksList.innerHTML = `<div class="empty-state"><span class="icon">🎯</span><p>Hali topshiriqlar qo'shilmagan.</p></div>`;
                document.getElementById("tasks-progress-fill").style.width = `0%`;
                document.getElementById("tasks-progress-text").innerText = `0% bajarildi`;
            }
        } catch (e) {
            console.error("Load full tasks error:", e);
        }
    }

    // Toggle Task status API
    async function toggleTaskStatus(taskId, isCompleted) {
        try {
            await fetch("/api/tasks/toggle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ task_id: taskId, is_completed: isCompleted })
            });
        } catch (e) {
            console.error("Toggle task error:", e);
        }
    }

    // Load Stories Library
    async function loadStoriesList() {
        const storiesList = document.getElementById("stories-list");
        // Show Skeletons
        storiesList.innerHTML = `
            <div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div></div>
            <div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div></div>
        `;

        try {
            const res = await fetch(`/api/get_stories?telegram_id=${telegramId}`);
            const data = await res.json();
            storiesList.innerHTML = "";

            if (data.stories && data.stories.length > 0) {
                data.stories.forEach(story => {
                    const card = document.createElement("div");
                    card.className = "story-card";
                    card.innerHTML = `
                        <div class="story-card-info">
                            <h3>${story.title}</h3>
                            <p>📚 ${story.moral_lesson.substring(0, 45)}...</p>
                        </div>
                        <span class="story-card-arrow">➡️</span>
                    `;
                    card.addEventListener("click", () => {
                        triggerHaptic();
                        openStoryViewer(story);
                    });
                    storiesList.appendChild(card);
                });
            } else {
                storiesList.innerHTML = `
                    <div class="empty-state">
                        <span class="icon">📖</span>
                        <p>Hali hech qanday ertak yaratilmagan. Bosh sahifadan sehrli ertak yaratib ko'ring!</p>
                    </div>
                `;
            }
        } catch (e) {
            console.error("Load stories error:", e);
            storiesList.innerHTML = `<p class="empty-text">Ertaklarni yuklashda xatolik yuz berdi.</p>`;
        }
    }

    // Load Referral Info
    async function loadReferralStats() {
        try {
            const res = await fetch(`/api/referral?telegram_id=${telegramId}`);
            const data = await res.json();
            document.getElementById("ref-count").innerText = data.invited_count;
        } catch (e) {
            console.error("Load referral error:", e);
        }
    }

    // Copy referral link
    document.getElementById("btn-copy-ref").addEventListener("click", () => {
        triggerHaptic();
        const copyText = document.getElementById("ref-link-input");
        copyText.select();
        copyText.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(copyText.value);
        showAlert("Havola buferga nusxalandi! Do'stlaringizga yuborishingiz mumkin.");
    });

    // 5. Generate Story Logic
    document.getElementById("btn-generate-story").addEventListener("click", async () => {
        triggerHaptic();
        const problemKey = document.getElementById("story-problem-key").value;
        if (!problemKey) {
            showAlert("Iltimos, avval ertak mavzusini tanlang!");
            return;
        }

        const genBtn = document.getElementById("btn-generate-story");
        const originalText = genBtn.innerHTML;
        
        genBtn.disabled = true;
        genBtn.innerHTML = `<span class="spinner" style="width:16px;height:16px;margin:0 6px 0 0;display:inline-block;vertical-align:middle;border-width:2px;"></span> Sehrlanmoqda...`;

        try {
            const response = await fetch("/api/generate_story", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    telegram_id: telegramId,
                    problem_key: problemKey
                })
            });
            const data = await response.json();
            if (response.status === 200 && data.success) {
                // Update User details
                currentUser.bonus_tokens = data.user.bonus_tokens;
                currentUser.subscription_status = data.user.subscription_status;
                updateUI();

                // Open the new story
                openStoryViewer(data.story);
            } else {
                showAlert(data.error || "Ertak yaratishda muammo yuz berdi.");
            }
        } catch (e) {
            console.error("Generate story error:", e);
            showAlert("Tarmoq ulanishida xatolik.");
        } finally {
            genBtn.disabled = false;
            genBtn.innerHTML = originalText;
        }
    });

    // Duet Voice Recording States, 3D Book & Web Audio FX Variables
    let audioBlobs = { 1: null, 2: null, 3: null };
    let mediaRecorders = { 1: null, 2: null, 3: null };
    let audioUrls = { 1: null, 2: null, 3: null };
    let audioCtx = null;
    let lullabyInterval = null;
    let lullabyGainNode = null;
    let currentlyPlayingSources = [];
    let isMasterPlaying = false;
    let micStream = null;

    // 3D Book States
    let currentPage = 0;
    let activeWordTimers = [];

    function splitStoryIntoThreeParts(text) {
        // Split text by sentences (. ! ?)
        const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
        
        if (sentences.length <= 3) {
            return [
                sentences[0] || "Ertak boshlanishi.",
                sentences[1] || "Ertak davomi.",
                sentences.slice(2).join(" ") || "Ertak xulosasi."
            ];
        }
        
        const third = Math.ceil(sentences.length / 3);
        const part1 = sentences.slice(0, third).join(" ");
        const part2 = sentences.slice(third, third * 2).join(" ");
        const part3 = sentences.slice(third * 2).join(" ");
        
        return [part1, part2, part3];
    }

    // Populate a book page with individual animated word spans
    function populateBookPage(pageNum, text) {
        const container = document.getElementById(`book-text-${pageNum}`);
        if (!container) return;
        container.innerHTML = "";
        
        const words = text.split(/\s+/);
        words.forEach((w) => {
            if (w.trim().length === 0) return;
            const span = document.createElement("span");
            span.className = "story-word";
            span.innerText = w;
            container.appendChild(span);
            container.appendChild(document.createTextNode(" "));
        });
    }

    // 3D Book page turn controller
    function flipToPage(pageIndex) {
        if (pageIndex < 0 || pageIndex > 3) return;
        currentPage = pageIndex;
        
        const pages = document.querySelectorAll(".book-page");
        pages.forEach((page, idx) => {
            page.classList.remove("active", "flipped");
            if (idx === currentPage) {
                page.classList.add("active");
            } else if (idx < currentPage) {
                page.classList.add("flipped");
            }
        });
        
        const ind = document.getElementById("book-page-indicator");
        if (ind) {
            ind.innerText = currentPage === 0 ? "Muqova" : `Sahifa ${currentPage} / 3`;
        }
        
        document.getElementById("btn-prev-page").disabled = (currentPage === 0);
        document.getElementById("btn-next-page").disabled = (currentPage === 3);
    }

    function getIllustrationsForProblem(story) {
        let prefix = "screentime"; // default
        
        // If the story has problem_key stored, use it directly
        if (story.problem_key) {
            prefix = story.problem_key;
        } else {
            // Heuristic fallback scanning the text/title
            const text = (story.title + " " + (story.content_text || story.story || "")).toLowerCase();
            if (text.includes("tish") || text.includes("cho'tka")) {
                prefix = "teeth_brush";
            } else if (text.includes("ovqat") || text.includes("sabzavot") || text.includes("olma") || text.includes("meva")) {
                prefix = "food";
            } else if (text.includes("uyqu") || text.includes("uxlash") || text.includes("yulduzli tun") || text.includes("tun siri")) {
                prefix = "bedtime";
            } else if (text.includes("odob") || text.includes("tabassum") || text.includes("jizzaki") || text.includes("yig'lar")) {
                prefix = "behavior";
            }
        }
        
        // Return corresponding illustration images.
        return {
            cover: `images/${prefix}_cover.png`,
            p1: `images/${prefix}_1.png`,
            p2: `images/${prefix}_2.png`,
            p3: `images/${prefix}_3.png`
        };
    }

    // 6. Story Viewer Logic
    function openStoryViewer(story) {
        document.getElementById("view-story-title").innerText = story.title;
        document.getElementById("view-story-body").innerText = story.content_text;
        document.getElementById("view-story-moral").innerText = story.moral_lesson;
        document.getElementById("view-story-task").innerText = story.daily_task;
        
        // Nana Banana Cover Branding & Title
        document.getElementById("book-cover-title").innerText = story.title;

        // Dynamic background illustrations mapping
        const imgs = getIllustrationsForProblem(story);
        document.getElementById("book-cover-img").src = imgs.cover;
        document.getElementById("book-page-img-1").src = imgs.p1;
        document.getElementById("book-page-img-2").src = imgs.p2;
        document.getElementById("book-page-img-3").src = imgs.p3;

        // Reset Audio player status
        document.getElementById("audio-status").innerText = "Ovozlashtirilgan audio tinglash";
        document.getElementById("btn-play-audio").querySelector(".icon").innerText = "▶️";

        // Split story into 3 duet segments and populate pages
        const parts = splitStoryIntoThreeParts(story.content_text);
        populateBookPage(1, parts[0]);
        populateBookPage(2, parts[1]);
        populateBookPage(3, parts[2]);

        // Reset Recording States
        audioBlobs = { 1: null, 2: null, 3: null };
        audioUrls = { 1: null, 2: null, 3: null };
        
        // Update recording buttons UI
        for (let i = 1; i <= 3; i++) {
            document.querySelector(`.btn-start-rec[data-seg="${i}"]`).classList.remove("hidden");
            document.querySelector(`.btn-stop-rec[data-seg="${i}"]`).classList.add("hidden");
            document.querySelector(`.btn-play-rec[data-seg="${i}"]`).classList.add("hidden");
            const statusEl = document.getElementById(`rec-status-${i}`);
            statusEl.innerText = "Kutilmoqda";
            statusEl.className = "rec-status";
        }
        document.getElementById("btn-play-duet").disabled = true;
        
        stopMasterPlay();
        flipToPage(0); // Show cover page

        showScreen("story-viewer-screen");
    }

    // Start Recording Segment
    async function startSegmentRecording(segmentId) {
        triggerHaptic();
        try {
            if (!micStream) {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            
            const chunks = [];
            const recorder = new MediaRecorder(micStream);
            mediaRecorders[segmentId] = recorder;
            
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
                audioBlobs[segmentId] = blob;
                audioUrls[segmentId] = URL.createObjectURL(blob);
                
                document.querySelector(`.btn-play-rec[data-seg="${segmentId}"]`).classList.remove("hidden");
                const statusEl = document.getElementById(`rec-status-${segmentId}`);
                statusEl.innerText = "Yozildi ✓";
                statusEl.className = "rec-status recorded";
                
                checkAllRecorded();
                uploadVoiceSegment(segmentId, blob);
            };
            
            recorder.start();
            
            document.querySelector(`.btn-start-rec[data-seg="${segmentId}"]`).classList.add("hidden");
            document.querySelector(`.btn-stop-rec[data-seg="${segmentId}"]`).classList.remove("hidden");
            const statusEl = document.getElementById(`rec-status-${segmentId}`);
            statusEl.innerText = "Yozilmoqda...";
            statusEl.className = "rec-status recording";
            
        } catch (e) {
            console.error("Mic access error:", e);
            showAlert("Mikrofonni faollashtirishda xatolik yuz berdi. Ruxsat berilganligini tekshiring.");
        }
    }

    // Stop Recording Segment
    function stopSegmentRecording(segmentId) {
        triggerHaptic();
        const recorder = mediaRecorders[segmentId];
        if (recorder && recorder.state !== "inactive") {
            recorder.stop();
        }
        document.querySelector(`.btn-start-rec[data-seg="${segmentId}"]`).classList.remove("hidden");
        document.querySelector(`.btn-stop-rec[data-seg="${segmentId}"]`).classList.add("hidden");
    }

    // Play individual recorded segment preview
    function playSegmentPreview(segmentId) {
        triggerHaptic();
        if (audioUrls[segmentId]) {
            const aud = new Audio(audioUrls[segmentId]);
            aud.play();
        }
    }

    // Enable Combined Play Button if all 3 parts recorded
    function checkAllRecorded() {
        if (audioBlobs[1] && audioBlobs[2] && audioBlobs[3]) {
            document.getElementById("btn-play-duet").disabled = false;
        } else {
            document.getElementById("btn-play-duet").disabled = true;
        }
    }

    async function uploadVoiceSegment(segmentId, blob) {
        const role = (segmentId === 2) ? "mother" : "father";
        
        const formData = new FormData();
        formData.append("voice", blob, `segment_${segmentId}.webm`);
        formData.append("telegram_id", telegramId);
        formData.append("role", role);
        formData.append("segment_id", segmentId);

        try {
            const response = await fetch("/api/upload_voice", {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            if (data.success && data.samples_count) {
                updateVoiceCloneStatus(data.samples_count);
            }
        } catch (e) {
            console.error("Voice upload failed:", e);
        }
    }

    function updateVoiceCloneStatus(samplesCount) {
        const m = samplesCount.mother || 0;
        const f = samplesCount.father || 0;
        
        const pct = Math.min(Math.round(((m + f) / 6) * 100), 100);
        
        const textEl = document.getElementById("voice-status-text");
        const fillEl = document.getElementById("voice-clone-progress-fill");
        
        if (textEl) {
            if (m >= 3 && f >= 3) {
                textEl.innerHTML = "🟢 <b>Ovoz modeli faol!</b> Auto-Read ota-ona ovozida o'qiydi.";
            } else {
                textEl.innerText = `Ovoz modeli kloni: Ona (${m}/3), Ota (${f}/3) yozib olindi`;
            }
        }
        if (fillEl) {
            fillEl.style.width = `${pct}%`;
            if (m >= 3 && f >= 3) {
                fillEl.style.background = "#4CAF50";
            } else {
                fillEl.style.background = "linear-gradient(90deg, #FFBD3F 0%, var(--primary) 100%)";
            }
        }
    }

    // Synthesized Lullaby Generator (Sine wave + Triangle chime music box arpeggio)
    function playSynthesizedLullaby(ctx, outputNode) {
        const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00]; // C pentatonic
        const pattern = [0, 2, 4, 3, 5, 4, 2, 1]; // slow lullaby loop
        let index = 0;
        
        function playNote() {
            if (!ctx || ctx.state === 'suspended') return;
            const noteFreq = notes[pattern[index % pattern.length]];
            index++;
            
            // Primary pure tone
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = "sine";
            osc1.frequency.value = noteFreq;
            
            gain1.gain.setValueAtTime(0, ctx.currentTime);
            gain1.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.05); // soft pluck
            gain1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.2); // ring out
            
            osc1.connect(gain1);
            gain1.connect(outputNode);
            
            // Secondary harmonic (bell chime effect)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = "triangle";
            osc2.frequency.value = noteFreq * 2; // Octave harmonic
            
            gain2.gain.setValueAtTime(0, ctx.currentTime);
            gain2.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 0.02); // quick hit
            gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6); // fast decay
            
            osc2.connect(gain2);
            gain2.connect(outputNode);
            
            osc1.start();
            osc2.start();
            osc1.stop(ctx.currentTime + 3.0);
            osc2.stop(ctx.currentTime + 3.0);
        }
        
        playNote();
        lullabyInterval = setInterval(playNote, 800);
    }

    // Karaoke text glow animator
    function highlightWords(segmentId, duration, startTimeOffset) {
        const container = document.getElementById(`book-text-${segmentId}`);
        if (!container) return;
        const words = container.querySelectorAll(".story-word");
        if (words.length === 0) return;
        
        const wordTime = (duration * 1000) / words.length; // ms per word
        
        words.forEach((wordSpan, index) => {
            const timerId = setTimeout(() => {
                // Deactivate all words on this page
                words.forEach(w => w.classList.remove("active"));
                // Activate current word
                wordSpan.classList.add("active");
                
                // Auto page turning as audio progresses!
                if (currentPage !== segmentId) {
                    flipToPage(segmentId);
                }
            }, startTimeOffset * 1000 + index * wordTime);
            
            activeWordTimers.push(timerId);
        });
    }

    function clearAllWordHighlights() {
        activeWordTimers.forEach(clearTimeout);
        activeWordTimers = [];
        document.querySelectorAll(".story-word").forEach(w => w.classList.remove("active"));
    }

    // Helper to stop all playing audio sources
    function stopMasterPlay() {
        isMasterPlaying = false;
        const btn = document.getElementById("btn-play-duet");
        if (btn) btn.innerHTML = "<span>🎧 Birlashtirilgan Ertakni Eshitish</span>";
        
        // Stop lullaby interval
        if (lullabyInterval) {
            clearInterval(lullabyInterval);
            lullabyInterval = null;
        }
        // Stop all voice buffers
        currentlyPlayingSources.forEach(src => {
            try { src.stop(); } catch(e){}
        });
        currentlyPlayingSources = [];
        
        clearAllWordHighlights();

        if (audioCtx) {
            audioCtx.close();
            audioCtx = null;
        }
    }

    // Duck background music during active voice segment
    function duckLullaby(startTime, duration, musicVol) {
        if (!lullabyGainNode || !audioCtx) return;
        
        const gainParam = lullabyGainNode.gain;
        const duckTime = Math.max(startTime - 0.2, audioCtx.currentTime);
        
        gainParam.setValueAtTime(musicVol, duckTime);
        gainParam.linearRampToValueAtTime(musicVol * 0.15, startTime); // duck down to 15%
        
        gainParam.setValueAtTime(musicVol * 0.15, startTime + duration);
        gainParam.linearRampToValueAtTime(musicVol, startTime + duration + 0.5); // ramp up
    }

    // Play Combined Voice + Background Lullaby with DSP effects
    async function playCombinedDuet() {
        triggerHaptic();
        if (isMasterPlaying) {
            stopMasterPlay();
            return;
        }

        isMasterPlaying = true;
        document.getElementById("btn-play-duet").innerHTML = "<span>To'xtatish ⏸️</span>";

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        const applyReverb = document.getElementById("fx-reverb").checked;
        const applyWarmth = document.getElementById("fx-warm").checked;
        const playMusic = document.getElementById("bg-music-toggle").checked;
        const musicVol = parseFloat(document.getElementById("bg-music-volume").value);

        // 1. Play Background Lullaby Music
        if (playMusic) {
            lullabyGainNode = audioCtx.createGain();
            lullabyGainNode.gain.setValueAtTime(musicVol, audioCtx.currentTime);
            lullabyGainNode.connect(audioCtx.destination);
            playSynthesizedLullaby(audioCtx, lullabyGainNode);
        }

        // 2. Play the 3 recorded segments sequentially
        let nextStartTime = audioCtx.currentTime + 0.5; // Start voice after 0.5s

        try {
            clearAllWordHighlights();
            flipToPage(1); // Auto flip to page 1

            for (let segId = 1; segId <= 3; segId++) {
                if (!isMasterPlaying) break;
                const blob = audioBlobs[segId];
                
                const startOffset = nextStartTime - audioCtx.currentTime;
                const duration = await scheduleVoiceSegment(blob, nextStartTime, applyReverb, applyWarmth);
                
                // Trigger ducking
                if (playMusic) {
                    duckLullaby(nextStartTime, duration, musicVol);
                }
                
                // Trigger karaoke highlight
                highlightWords(segId, duration, startOffset);
                
                nextStartTime += duration + 1.2; // 1.2 second gap between pages
            }
            
            // Fade out music and stop after last segment is complete
            if (isMasterPlaying) {
                const totalDuration = nextStartTime - audioCtx.currentTime;
                setTimeout(() => {
                    if (isMasterPlaying) {
                        if (lullabyGainNode) {
                            lullabyGainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.5);
                        }
                        setTimeout(stopMasterPlay, 1600);
                    }
                }, totalDuration * 1000);
            }
        } catch(err) {
            console.error("Duet play error:", err);
            stopMasterPlay();
        }
    }

    // Decode voice and connect DSP nodes (Warmth / Reverb)
    async function scheduleVoiceSegment(blob, startTime, applyReverb, applyWarmth) {
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        
        let currentNode = source;
        
        // A. Low-pass warmth filter
        if (applyWarmth) {
            const lowpass = audioCtx.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.setValueAtTime(1100, audioCtx.currentTime); // Cut high frequencies for warmth
            currentNode.connect(lowpass);
            currentNode = lowpass;
        }
        
        // B. Magic Echo/Reverb simulation
        if (applyReverb) {
            const delay = audioCtx.createDelay(1.0);
            delay.delayTime.setValueAtTime(0.3, audioCtx.currentTime); // 300ms echo
            
            const feedback = audioCtx.createGain();
            feedback.gain.setValueAtTime(0.25, audioCtx.currentTime); // 25% feedback volume
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(700, audioCtx.currentTime);
            
            // Connect delay feedback loop
            delay.connect(feedback);
            feedback.connect(filter);
            filter.connect(delay);
            
            const reverbGain = audioCtx.createGain();
            reverbGain.gain.setValueAtTime(0.2, audioCtx.currentTime); // wet gain
            
            currentNode.connect(delay);
            delay.connect(reverbGain);
            reverbGain.connect(audioCtx.destination);
        }
        
        // Normalizer Gain
        const normGain = audioCtx.createGain();
        normGain.gain.setValueAtTime(1.2, audioCtx.currentTime); // slight voice boost
        
        currentNode.connect(normGain);
        normGain.connect(audioCtx.destination);
        
        source.start(startTime);
        currentlyPlayingSources.push(source);
        
        return audioBuffer.duration;
    }

    // Setup Dubbing listeners
    document.querySelectorAll(".btn-start-rec").forEach(btn => {
        btn.addEventListener("click", () => {
            const seg = btn.getAttribute("data-seg");
            startSegmentRecording(seg);
        });
    });

    document.querySelectorAll(".btn-stop-rec").forEach(btn => {
        btn.addEventListener("click", () => {
            const seg = btn.getAttribute("data-seg");
            stopSegmentRecording(seg);
        });
    });

    document.querySelectorAll(".btn-play-rec").forEach(btn => {
        btn.addEventListener("click", () => {
            const seg = btn.getAttribute("data-seg");
            playSegmentPreview(seg);
        });
    });

    document.getElementById("btn-play-duet").addEventListener("click", () => {
        playCombinedDuet();
    });

    // Setup 3D Book Navigation listeners
    document.getElementById("btn-prev-page").addEventListener("click", () => {
        triggerHaptic();
        flipToPage(currentPage - 1);
    });

    document.getElementById("btn-next-page").addEventListener("click", () => {
        triggerHaptic();
        flipToPage(currentPage + 1);
    });

    document.getElementById("btn-close-story").addEventListener("click", () => {
        triggerHaptic();
        stopMasterPlay();
        showScreen("dashboard-screen");
        if (activeTab === "tab-stories") {
            loadStoriesList();
        } else {
            loadDashboardData();
        }
    });

    // Mock Audio Player toggle
    let isPlaying = false;
    document.getElementById("btn-play-audio").addEventListener("click", () => {
        triggerHaptic();
        
        const selectedVoice = document.getElementById("voice-char").value;
        if (selectedVoice === "cloned") {
            // Check if user has recorded their duet segments
            if (!(audioBlobs[1] && audioBlobs[2] && audioBlobs[3])) {
                showAlert("Ota va ona ovozlari to'liq yozilmagan! Iltimos, pastdagi 'Sehrli Duet' qismida 3 ta sahifani ham o'qib yozib oling.");
                return;
            }
            playCombinedDuet();
            return;
        }

        isPlaying = !isPlaying;
        const playIcon = document.getElementById("btn-play-audio").querySelector(".icon");
        const audioStatus = document.getElementById("audio-status");
        
        if (isPlaying) {
            playIcon.innerText = "⏸️";
            audioStatus.innerText = "AI Ovozli ertak ijro etilmoqda...";
            
            // Text to speech simulation using Web Speech API if supported
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const storyText = document.getElementById("view-story-body").innerText;
                const utterance = new SpeechSynthesisUtterance(storyText.substring(0, 150) + "..."); // Short snippet for demo
                utterance.lang = "tr-TR"; // Turkish voice as rough approximation for Uzbek if Uzbek isn't installed
                utterance.rate = 0.9;
                utterance.onend = () => {
                    playIcon.innerText = "▶️";
                    audioStatus.innerText = "Audio tugadi";
                    isPlaying = false;
                };
                window.speechSynthesis.speak(utterance);
            }
        } else {
            playIcon.innerText = "▶️";
            audioStatus.innerText = "Audio to'xtatildi";
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        }
    });

    // Add Story Task to checklist
    document.getElementById("btn-add-story-task").addEventListener("click", () => {
        triggerHaptic();
        showAlert("Ertakdagi tarbiyaviy vazifa bolaning kunlik vazifalar ro'yxatiga qo'shildi!");
    });

    // 7. Edit Profile Button
    document.getElementById("btn-edit-profile").addEventListener("click", () => {
        triggerHaptic();
        // Populate current details in form
        if (currentChild) {
            document.getElementById("child-name").value = currentChild.name;
            document.getElementById("child-age").value = currentChild.age;
            document.getElementById("fav-hero").value = currentChild.favorite_hero;
            document.getElementById("fav-animal").value = currentChild.favorite_animal;
            document.getElementById("fav-toy").value = currentChild.favorite_toy;
            document.getElementById("boy-friend").value = currentChild.boy_friend_name;
            document.getElementById("girl-friend").value = currentChild.girl_friend_name;

            // Checkboxes
            document.querySelectorAll(".problem-chips input[type='checkbox']").forEach(cb => {
                cb.checked = currentChild.problems && currentChild.problems.includes(cb.value);
            });
        }
        showScreen("onboarding-screen");
    });

    // 8. Subscription Simulation
    document.querySelectorAll(".btn-subscribe").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            triggerHaptic();
            const plan = btn.getAttribute("data-plan");
            
            btn.disabled = true;
            btn.innerText = "Faollashtirilmoqda...";

            try {
                const response = await fetch("/api/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ telegram_id: telegramId, plan_type: plan })
                });
                const data = await response.json();
                if (data.success) {
                    currentUser.subscription_status = data.user.subscription_status;
                    currentUser.subscription_expires_at = data.user.subscription_expires_at;
                    currentUser.bonus_tokens = data.user.bonus_tokens;
                    
                    updateUI();
                    showAlert(`Tabriklaymiz! Siz ${plan === 'weekly' ? 'Haftalik' : 'Oylik'} Premium obunani muvaffaqiyatli faollashtirdingiz.`);
                } else {
                    showAlert("To'lovni amalga oshirishda xatolik.");
                }
            } catch (e) {
                console.error("Subscribe error:", e);
                showAlert("Aloqa xatosi.");
            } finally {
                btn.disabled = false;
                btn.innerText = "Sotib olish";
            }
        });
    });

    // Vertical Scroll Observer logic
    function initVerticalScroll() {
        const sections = document.querySelectorAll('.scroll-section');
        
        // Setup observer for fade up animations
        const observerOptions = {
            root: document.getElementById('scroll-container'),
            rootMargin: '0px',
            threshold: 0.5
        };

        const scrollContainer = document.getElementById('scroll-container');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    // Add haptic feedback when snapping to a new section
                    triggerHaptic();
                    
                    // Update scroll container background color directly to fix blend mode isolation
                    if (scrollContainer && entry.target.dataset.color) {
                        scrollContainer.style.background = entry.target.dataset.color;
                    }
                }
            });
        }, observerOptions);

        sections.forEach(section => {
            observer.observe(section);
        });

        // Attach listeners to new buttons
        document.querySelectorAll('.btn-skip, .btn-start-adventure').forEach(btn => {
            btn.addEventListener('click', () => {
                triggerHaptic();
                goToLogin();
            });
        });
    }

    // Flow 1: Go to Telegram Login
    window.goToLogin = function() {
        showScreen("login-screen");
    };

    // Flow 2: Simulate Telegram Login and go to Profile Setup
    window.simulateTelegramLogin = function() {
        triggerHaptic();
        // Simulate grabbing name from Telegram (mock)
        const tgName = "Malika"; // In real app, this would be window.Telegram.WebApp.initDataUnsafe.user.first_name
        document.getElementById('parent-name').value = tgName;
        
        showScreen("profile-setup-screen");
        generateChildrenFields(); // Generate initial field
    };

    // Dynamic Form Generation
    window.generateChildrenFields = function() {
        const countInput = document.getElementById('children-count');
        let count = parseInt(countInput.value) || 1;
        
        // Boundaries
        if (count < 1) { count = 1; countInput.value = 1; }
        if (count > 10) { count = 10; countInput.value = 10; }
        
        const container = document.getElementById('children-fields-container');
        container.innerHTML = ''; // Clear existing
        
        for (let i = 1; i <= count; i++) {
            const childGroup = document.createElement('div');
            childGroup.className = 'child-field-group';
            childGroup.innerHTML = `
                <h4 class="child-field-title">${i}-Farzand</h4>
                <div class="input-row">
                    <div class="input-group">
                        <input type="text" placeholder="Ismi" required>
                    </div>
                    <div class="input-group small">
                        <input type="number" placeholder="Yoshi" min="0" max="18" required>
                    </div>
                </div>
            `;
            container.appendChild(childGroup);
        }
    };

    // Flow 3: Save Profile and go to Dashboard
    window.saveProfile = function(event) {
        event.preventDefault();
        triggerHaptic();
        
        // Here you would collect the data and send to backend
        // For now, we just go to the dashboard
        showScreen("dashboard-screen");
        triggerConfetti();
    };

    // Initial Startup flow
    setTimeout(() => {
        showScreen("carousel-screen");
        initVerticalScroll();
    }, 1500); // 1.5s loading animation
});
