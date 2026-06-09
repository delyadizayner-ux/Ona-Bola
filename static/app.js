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

    // Fallback: extract telegramId from start param if not set otherwise
    if (!telegramId && referredBy && referredBy.startsWith("ref_")) {
        const extractedId = parseInt(referredBy.replace("ref_", ""));
        if (!isNaN(extractedId)) {
            telegramId = extractedId;
        }
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

                // Save to localStorage if we got user info
                if (currentUser.mother_name || currentUser.father_name || currentChild) {
                    const profileToSave = {
                        mother_name: currentUser.mother_name || "",
                        father_name: currentUser.father_name || "",
                        child_name: currentChild ? currentChild.name : "Farzandim",
                        child_age: currentChild ? currentChild.age : 4,
                        problems: currentChild ? currentChild.problems : ['behavior']
                    };
                    localStorage.setItem("onabola_profile", JSON.stringify(profileToSave));
                    localStorage.setItem("onabola_logged_in", "true");
                }
                
                if (data.samples_count) {
                    updateVoiceCloneStatus(data.samples_count);
                    
                    const m = data.samples_count.mother || 0;
                    const f = data.samples_count.father || 0;
                    if (m >= 3 && f >= 3) {
                        currentDuoIndex = 6;
                    } else if (m < 3) {
                        currentDuoIndex = m;
                    } else {
                        currentDuoIndex = 3 + f;
                    }
                    updateDuoWizard();
                } else {
                    currentDuoIndex = 0;
                    updateDuoWizard();
                }

                if (!currentUser.mother_name && !currentUser.father_name && !data.child) {
                    showScreen("profile-setup-screen");
                    generateChildrenFields();
                } else {
                    if (!currentChild) {
                        currentChild = {
                            name: "Kichkintoy",
                            age: 4,
                            problems: ["behavior"]
                        };
                    }
                    localStorage.setItem("onabola_logged_in", "true");
                    showScreen("dashboard-screen");
                    loadDashboardData();
                }
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
        const mNameEl = document.getElementById("profile-mother-name");
        if (mNameEl) mNameEl.innerText = currentUser.mother_name || "-";
        const fNameEl = document.getElementById("profile-father-name");
        if (fNameEl) fNameEl.innerText = currentUser.father_name || "-";
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
            // Note: bad-habit/problem selection now lives inside the story wizard
            // (renderStoryAnketa), so no standalone problem selector is populated here.
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
        } else if (tabId === "tab-dubbing") {
            updateDuoWizard();
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

    // 5. Story Wizard Logic (select children -> anketa -> bad habits -> generate)

    // Bad-habit catalog (keys must match story_generator.HABIT_INFO on the backend)
    const WIZARD_HABITS = [
        { key: "screentime",   label: "📱 Ko'p telefon/planshet ko'rish" },
        { key: "tantrum",      label: "🛒 Do'konda janjal/harhasha qilish" },
        { key: "kindergarten", label: "🏫 Bog'chaga borishni xohlamaslik" },
        { key: "homework",     label: "📚 Dars/mashq qilishni xohlamaslik" },
        { key: "moody",        label: "😠 Injiq, qaysar bo'lib qolish" },
        { key: "teeth_brush",  label: "🪥 Tish yuvishni yoqtirmaslik" },
        { key: "food",         label: "🍎 Foydali taomni rad etish" },
        { key: "bedtime",      label: "🌙 Vaqtida uxlamaslik" },
        { key: "behavior",     label: "🙉 Ota-ona so'ziga quloq solmaslik" },
    ];

    // Escape a value so it is safe inside a double-quoted HTML attribute
    function escAttr(s) {
        return String(s == null ? "" : s).replace(/"/g, "&quot;");
    }

    // Render one anketa card per child, pre-filling the first one from the saved profile
    window.renderStoryAnketa = function() {
        const container = document.getElementById("wizard-anketa-container");
        if (!container) return;
        const countInput = document.getElementById("wizard-children-count");
        let count = parseInt(countInput && countInput.value) || 1;
        if (count < 1) count = 1;
        if (count > 6) count = 6;

        let html = "";
        for (let i = 0; i < count; i++) {
            const pre = (i === 0 && currentChild) ? currentChild : {};
            const friend = pre.best_friend || pre.boy_friend_name || pre.girl_friend_name || "";
            const problems = pre.problems || [];

            const habitsHtml = WIZARD_HABITS.map(h => `
                <label class="wizard-habit-opt">
                    <input type="checkbox" class="wizard-habit" data-child="${i}" value="${h.key}" ${problems.includes(h.key) ? "checked" : ""}>
                    <span>${h.label}</span>
                </label>`).join("");

            html += `
            <div class="wizard-child-card" data-child="${i}">
                <h3 class="wizard-child-title">👶 ${i + 1}-farzand</h3>
                <div class="input-row">
                    <div class="input-group">
                        <label>Ismi</label>
                        <input type="text" class="wizard-field" data-child="${i}" data-field="name" value="${escAttr(pre.name)}" placeholder="Masalan: Diyor" required>
                    </div>
                    <div class="input-group">
                        <label>Yoshi</label>
                        <input type="number" class="wizard-field" data-child="${i}" data-field="age" min="1" max="18" value="${escAttr(pre.age || 4)}" required>
                    </div>
                </div>
                <div class="input-group">
                    <label>Sevimli qahramoni</label>
                    <input type="text" class="wizard-field" data-child="${i}" data-field="favorite_hero" value="${escAttr(pre.favorite_hero)}" placeholder="Masalan: Botir, Elza...">
                </div>
                <div class="input-group">
                    <label>Sevimli o'yinchog'i</label>
                    <input type="text" class="wizard-field" data-child="${i}" data-field="favorite_toy" value="${escAttr(pre.favorite_toy)}" placeholder="Masalan: ayiqcha, mashina...">
                </div>
                <div class="input-group">
                    <label>Eng yaqin o'rtog'i</label>
                    <input type="text" class="wizard-field" data-child="${i}" data-field="best_friend" value="${escAttr(friend)}" placeholder="Do'stining ismi">
                </div>
                <div class="input-group">
                    <label>Yoqtirgan mashg'uloti</label>
                    <input type="text" class="wizard-field" data-child="${i}" data-field="hobby" value="${escAttr(pre.hobby)}" placeholder="Masalan: rasm chizish, futbol...">
                </div>
                <div class="input-group">
                    <label>Yengishi kerak bo'lgan salbiy odat(lar)i</label>
                    <p class="wizard-hint">Belgilangan odatlar ertakda yumshoq, ibratli tarzda tuzatiladi.</p>
                    <div class="wizard-habits">${habitsHtml}</div>
                </div>
            </div>`;
        }
        container.innerHTML = html;
    };

    // Back button on the wizard
    window.closeStoryWizard = function() {
        triggerHaptic();
        showScreen("dashboard-screen");
    };

    // Open the wizard from the dashboard
    const openWizardBtn = document.getElementById("btn-open-story-wizard");
    if (openWizardBtn) {
        openWizardBtn.addEventListener("click", () => {
            triggerHaptic();
            const countInput = document.getElementById("wizard-children-count");
            if (countInput) countInput.value = 1;
            renderStoryAnketa();
            showScreen("story-wizard-screen");
        });
    }

    // Submit the wizard: collect children + voice mode, generate the story
    window.submitStoryWizard = async function(event) {
        if (event) event.preventDefault();
        triggerHaptic();

        const voiceModeEl = document.querySelector('#wizard-voice-mode input[name="voice_mode"]:checked');
        const voiceMode = voiceModeEl ? voiceModeEl.value : "none";

        const children = [];
        document.querySelectorAll(".wizard-child-card").forEach(card => {
            const getVal = (field) => {
                const el = card.querySelector(`.wizard-field[data-field="${field}"]`);
                return el ? el.value.trim() : "";
            };
            const name = getVal("name");
            if (!name) return; // skip empty children
            const habits = Array.from(card.querySelectorAll(".wizard-habit:checked")).map(c => c.value);
            children.push({
                name,
                age: parseInt(getVal("age")) || 4,
                favorite_hero: getVal("favorite_hero"),
                favorite_toy: getVal("favorite_toy"),
                best_friend: getVal("best_friend"),
                hobby: getVal("hobby"),
                bad_habits: habits,
            });
        });

        if (children.length === 0) {
            showAlert("Iltimos, kamida bitta farzandning ismini kiriting!");
            return;
        }

        const genBtn = document.getElementById("btn-wizard-generate");
        const originalText = genBtn.innerHTML;
        genBtn.disabled = true;
        genBtn.innerHTML = `<span class="spinner" style="width:16px;height:16px;margin:0 6px 0 0;display:inline-block;vertical-align:middle;border-width:2px;"></span> Sehrlanmoqda...`;

        try {
            const response = await fetch("/api/generate_story", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    telegram_id: telegramId,
                    children: children,
                    voice_mode: voiceMode
                })
            });
            const data = await response.json();
            if (response.status === 200 && data.success) {
                currentUser.bonus_tokens = data.user.bonus_tokens;
                currentUser.subscription_status = data.user.subscription_status;
                updateUI();
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
    };

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

    // Duolingo Style Dubbing Wizard States
    let duoSentences = [
        { role: "mother", label: "ONA: 1-Gap (Kirish)", text: "Bir bor ekan, bir yo'q ekan, qadim zamonda bir sehrli o'rmon bo'lgan ekan." },
        { role: "mother", label: "ONA: 2-Gap (Sarguzasht)", text: "Bu o'rmonda yashovchi kichik ayiqcha har kuni yangi sarguzashtlarni izlar edi." },
        { role: "mother", label: "ONA: 3-Gap (Xulosa)", text: "U yulduzli tunda shirin uyquga ketishdan oldin, oyisining ertaklarini tinglardi." },
        { role: "father", label: "OTA: 1-Gap (Kirish)", text: "Jasur botir o'zining sehrli qalqoni bilan doim bolalarni himoya qilar edi." },
        { role: "father", label: "OTA: 2-Gap (Sarguzasht)", text: "Farzandim, sen juda kuchli, aqlli va mehribon bola bo'lib ulg'aymoqdasan." },
        { role: "father", label: "OTA: 3-Gap (Xulosa)", text: "Biz sen bilan har doim faxrlanamiz va har qadamda seni qo'llab-quvvatlaymiz." }
    ];
    let currentDuoIndex = 0;
    let duoRecorder = null;
    let duoChunks = [];
    let duoAudioBlob = null;
    let duoAudioUrl = null;
    let duoMicStream = null;
    let duoWaveInterval = null;
    let isDuoRecording = false;

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

    // === DUOLINGO DUBBING WIZARD LOGIC ===
    function startDuoWaveformAnimation() {
        const bars = document.querySelectorAll("#duo-waveform .wave-bar");
        if (duoWaveInterval) clearInterval(duoWaveInterval);
        
        document.getElementById("duo-waveform").classList.add("active");
        
        duoWaveInterval = setInterval(() => {
            bars.forEach(bar => {
                const randomHeight = Math.floor(Math.random() * 80) + 10; // 10% to 90%
                bar.style.height = `${randomHeight}%`;
            });
        }, 100);
    }

    function stopDuoWaveformAnimation() {
        if (duoWaveInterval) {
            clearInterval(duoWaveInterval);
            duoWaveInterval = null;
        }
        document.getElementById("duo-waveform").classList.remove("active");
        const bars = document.querySelectorAll("#duo-waveform .wave-bar");
        bars.forEach(bar => {
            bar.style.height = "15%"; // reset to small line
        });
    }

    function updateDuoWizard() {
        if (currentUser) {
            document.getElementById("duo-stat-tokens").innerText = currentUser.bonus_tokens;
        }
        
        const homePointsEl = document.getElementById("home-stars-count");
        const duoPointsEl = document.getElementById("duo-stat-points");
        if (homePointsEl && duoPointsEl) {
            duoPointsEl.innerText = homePointsEl.innerText.replace(/[^0-9]/g, "") || "0";
        }

        if (currentDuoIndex >= 6) {
            document.getElementById("duo-wizard-active-step").classList.add("hidden");
            document.getElementById("duo-wizard-success-step").classList.remove("hidden");
            
            document.getElementById("duo-progress-fill").style.width = "100%";
            document.getElementById("duo-step-text").innerText = "Tashxis: 6 / 6";
            return;
        }

        document.getElementById("duo-wizard-active-step").classList.remove("hidden");
        document.getElementById("duo-wizard-success-step").classList.add("hidden");

        const step = duoSentences[currentDuoIndex];
        
        const speakerBadge = document.getElementById("duo-speaker-badge");
        if (step.role === "mother") {
            speakerBadge.innerText = `👩 ONA: ${currentDuoIndex + 1}-Gap (${currentDuoIndex === 2 ? 'Shivirlash' : 'Mehrli'})`;
            speakerBadge.style.backgroundColor = "rgba(229, 213, 255, 0.2)";
            speakerBadge.style.color = "#D2B4FF";
        } else {
            speakerBadge.innerText = `👨 OTA: ${currentDuoIndex - 2}-Gap (Xotirjam)`;
            speakerBadge.style.backgroundColor = "rgba(161, 227, 212, 0.2)";
            speakerBadge.style.color = "#A1E3D4";
        }

        document.getElementById("duo-sentence-text").innerText = `"${step.text}"`;

        const progressPercent = ((currentDuoIndex) / 6) * 100;
        document.getElementById("duo-progress-fill").style.width = `${progressPercent || 16.6}%`;
        document.getElementById("duo-step-text").innerText = `Gap: ${currentDuoIndex + 1} / 6`;

        const heroImg = document.getElementById("duo-character-img");
        if (heroImg) {
            const heroNum = (currentDuoIndex % 5) + 1;
            heroImg.src = `img/hero${heroNum}.png`;
        }

        duoAudioBlob = null;
        duoAudioUrl = null;
        document.getElementById("btn-duo-next").disabled = true;
        document.getElementById("duo-preview-row").classList.add("hidden");
        
        const waveContainer = document.getElementById("duo-waveform");
        if (waveContainer) {
            waveContainer.classList.remove("active");
        }
    }

    async function handleDuoRecClick() {
        triggerHaptic();
        const recBtn = document.getElementById("btn-duo-rec");

        if (!isDuoRecording) {
            try {
                if (!duoMicStream) {
                    duoMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                }
                
                duoChunks = [];
                duoRecorder = new MediaRecorder(duoMicStream);
                
                duoRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) duoChunks.push(e.data);
                };
                
                duoRecorder.onstop = () => {
                    duoAudioBlob = new Blob(duoChunks, { type: duoRecorder.mimeType || 'audio/webm' });
                    duoAudioUrl = URL.createObjectURL(duoAudioBlob);
                    
                    document.getElementById("duo-preview-row").classList.remove("hidden");
                    document.getElementById("btn-duo-next").disabled = false;
                };

                duoRecorder.start();
                isDuoRecording = true;
                
                recBtn.classList.add("recording");
                startDuoWaveformAnimation();
                
            } catch (e) {
                console.error("Mic access error:", e);
                showAlert("Mikrofonni faollashtirishda xatolik yuz berdi. Ruxsat berilganligini tekshiring.");
            }
        } else {
            if (duoRecorder && duoRecorder.state !== "inactive") {
                duoRecorder.stop();
            }
            isDuoRecording = false;
            recBtn.classList.remove("recording");
            stopDuoWaveformAnimation();
        }
    }

    async function handleDuoNextClick() {
        triggerHaptic();
        if (!duoAudioBlob) return;

        const nextBtn = document.getElementById("btn-duo-next");
        const originalText = nextBtn.innerHTML;
        nextBtn.disabled = true;
        nextBtn.innerHTML = `Yuklanmoqda...`;

        const step = duoSentences[currentDuoIndex];
        const role = step.role;
        
        let segmentId = 1;
        if (currentDuoIndex === 1 || currentDuoIndex === 4) {
            segmentId = 2;
        } else if (currentDuoIndex === 2 || currentDuoIndex === 5) {
            segmentId = 3;
        }

        const formData = new FormData();
        formData.append("voice", duoAudioBlob, `duo_${role}_seg${segmentId}.webm`);
        formData.append("telegram_id", telegramId);
        formData.append("role", role);
        formData.append("segment_id", segmentId);

        try {
            const response = await fetch("/api/upload_voice", {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                if (data.samples_count) {
                    updateVoiceCloneStatus(data.samples_count);
                }
                
                currentDuoIndex++;
                updateDuoWizard();
            } else {
                showAlert(data.error || "Ovoz namunasini yuklashda xatolik yuz berdi.");
            }
        } catch (e) {
            console.error("Duo upload failed:", e);
            showAlert("Tarmoq ulanishida xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
        } finally {
            nextBtn.disabled = false;
            nextBtn.innerHTML = originalText;
        }
    }

    async function handleDuoResetClick() {
        triggerHaptic();
        if (!confirm("Ovoz namunalarini to'liq o'chirib, boshidan yozishni xohlaysizmi?")) return;

        const resetBtn = document.getElementById("btn-duo-reset");
        const originalText = resetBtn.innerHTML;
        resetBtn.disabled = true;
        resetBtn.innerHTML = "O'chirilmoqda...";

        try {
            const res = await fetch("/api/reset_voice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ telegram_id: telegramId })
            });
            const data = await res.json();
            if (data.success) {
                currentDuoIndex = 0;
                updateVoiceCloneStatus({ mother: 0, father: 0 });
                updateDuoWizard();
                showAlert("Barcha ovoz namunalari o'chirildi. Endi boshidan yozishingiz mumkin.");
            } else {
                showAlert("Reset qilishda xatolik yuz berdi.");
            }
        } catch (e) {
            console.error("Reset failed:", e);
            showAlert("Tarmoq xatoligi.");
        } finally {
            resetBtn.disabled = false;
            resetBtn.innerHTML = originalText;
        }
    }

    // Setup Duolingo Dubbing Wizard listeners
    document.getElementById("btn-duo-rec").addEventListener("click", () => {
        handleDuoRecClick();
    });

    document.getElementById("btn-duo-next").addEventListener("click", () => {
        handleDuoNextClick();
    });

    document.getElementById("btn-duo-play").addEventListener("click", () => {
        triggerHaptic();
        if (duoAudioUrl) {
            const aud = new Audio(duoAudioUrl);
            aud.play();
        }
    });

    document.getElementById("btn-duo-rerecord").addEventListener("click", () => {
        triggerHaptic();
        duoAudioBlob = null;
        duoAudioUrl = null;
        document.getElementById("btn-duo-next").disabled = true;
        document.getElementById("duo-preview-row").classList.add("hidden");
    });

    document.getElementById("link-duo-skip").addEventListener("click", (e) => {
        e.preventDefault();
        triggerHaptic();
        currentDuoIndex++;
        updateDuoWizard();
    });

    document.getElementById("btn-duo-reset").addEventListener("click", () => {
        handleDuoResetClick();
    });

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
        
        // Populate mother and father names
        if (currentUser) {
            const motherInput = document.getElementById("mother-name");
            if (motherInput) motherInput.value = currentUser.mother_name || "";
            
            const fatherInput = document.getElementById("father-name");
            if (fatherInput) fatherInput.value = currentUser.father_name || "";
        }
        
        // Populate children fields
        if (currentChild) {
            const countInput = document.getElementById("children-count");
            if (countInput) countInput.value = 1; // currently supporting single child edits
            
            generateChildrenFields(); // generate the inputs
            
            // Populate child name and age
            const childNameInput = document.querySelector(".child-name-input");
            if (childNameInput) childNameInput.value = currentChild.name || "";
            
            const childAgeInput = document.querySelector(".child-age-input");
            if (childAgeInput) childAgeInput.value = currentChild.age || "";
        }
        
        showScreen("profile-setup-screen");
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
    window.simulateTelegramLogin = async function() {
        triggerHaptic();
        
        // Log in the user first (creates user in database and retrieves state)
        await loginUser();
        
        // If they were redirected to profile-setup-screen, populate it
        const motherInput = document.getElementById('mother-name');
        if (motherInput && !motherInput.value) {
            motherInput.value = "Malika"; // Grabbing name from Telegram mock
        }
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
                <div class="input-row no-stack">
                    <div class="input-group">
                        <input type="text" class="child-name-input" placeholder="Ismi" required>
                    </div>
                    <div class="input-group small">
                        <input type="number" class="child-age-input" placeholder="Yoshi" min="0" max="18" required>
                    </div>
                </div>
            `;
            container.appendChild(childGroup);
        }
    };

    // Flow 3: Save Profile and go to Dashboard
    window.saveProfile = async function(event) {
        event.preventDefault();
        triggerHaptic();
        
        // Collect data
        const motherName = document.getElementById('mother-name') ? document.getElementById('mother-name').value.trim() : '';
        const fatherName = document.getElementById('father-name') ? document.getElementById('father-name').value.trim() : '';
        
        // Get first child name
        const firstChildInput = document.querySelector('.child-name-input');
        const childName = firstChildInput ? firstChildInput.value.trim() : "Farzandim";
        
        const firstChildAgeInput = document.querySelector('.child-age-input');
        const childAge = firstChildAgeInput ? parseInt(firstChildAgeInput.value) || 4 : 4;
        
        const childProblems = (currentChild && currentChild.problems) ? currentChild.problems : ['behavior'];

        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = "Saqlanmoqda...";

        try {
            const res = await fetch("/api/save_profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    telegram_id: telegramId,
                    name: childName,
                    age: childAge,
                    mother_name: motherName,
                    father_name: fatherName,
                    problems: childProblems
                })
            });
            const data = await res.json();
            if (data.success) {
                currentUser = data.user;
                currentChild = data.child;
                
                updateUI();
                
                // Save logged in state in localStorage
                localStorage.setItem("onabola_logged_in", "true");

                // Save profile details to localStorage for persistence
                const profileToSave = {
                    mother_name: motherName,
                    father_name: fatherName,
                    child_name: childName,
                    child_age: childAge,
                    problems: childProblems
                };
                localStorage.setItem("onabola_profile", JSON.stringify(profileToSave));
                
                // Update dashboard inner elements
                const dashChildName = document.getElementById('dash-child-name');
                if (dashChildName) dashChildName.innerText = `${currentChild.name} Profili`;
                
                const dashChildAge = document.getElementById('dash-child-age');
                if (dashChildAge) dashChildAge.innerText = `${currentChild.age} yosh`;
                
                showScreen("dashboard-screen");
                loadDashboardData();
            } else {
                showAlert(data.error || "Profilni saqlashda xatolik yuz berdi.");
            }
        } catch (e) {
            console.error("Save profile error:", e);
            showAlert("Tarmoq ulanishida xatolik.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    };

    // Initial Startup flow
    setTimeout(async () => {
        // Attempt silent login on startup for any session if telegramId is present
        if (telegramId) {
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
                        
                        const m = data.samples_count.mother || 0;
                        const f = data.samples_count.father || 0;
                        if (m >= 3 && f >= 3) {
                            currentDuoIndex = 6;
                        } else if (m < 3) {
                            currentDuoIndex = m;
                        } else {
                            currentDuoIndex = 3 + f;
                        }
                        updateDuoWizard();
                    } else {
                        currentDuoIndex = 0;
                        updateDuoWizard();
                    }

                    // Check if we have a locally saved profile to restore
                    const localProfileStr = localStorage.getItem("onabola_profile");
                    const hasLocalProfile = !!localProfileStr;

                    // Has the user already finished registration (parent names or a child profile)?
                    let profileComplete = !!(currentUser.mother_name || currentUser.father_name || currentChild);

                    // If the database profile was reset (e.g. Vercel /tmp) but we kept a local
                    // backup, restore it silently so the user is treated as already-registered.
                    if (!profileComplete && hasLocalProfile) {
                        try {
                            const localProfile = JSON.parse(localProfileStr);
                            const restoreRes = await fetch("/api/save_profile", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    telegram_id: telegramId,
                                    name: localProfile.child_name || "Farzandim",
                                    age: parseInt(localProfile.child_age) || 4,
                                    mother_name: localProfile.mother_name || "",
                                    father_name: localProfile.father_name || "",
                                    problems: localProfile.problems || ['behavior']
                                })
                            });
                            const restoreData = await restoreRes.json();
                            if (restoreData.success) {
                                currentUser = restoreData.user;
                                currentChild = restoreData.child;
                                updateUI();
                                profileComplete = true;
                            }
                        } catch (err) {
                            console.error("Failed to restore profile from local storage:", err);
                        }
                    }

                    // Returning user who already registered + filled the profile:
                    // skip the onboarding/login screens and go straight to the dashboard.
                    // The login/onboarding is shown ONLY to brand-new users (no profile yet).
                    if (profileComplete) {
                        localStorage.setItem("onabola_logged_in", "true");
                        showScreen("dashboard-screen");
                        loadDashboardData();
                        return;
                    }
                }
            } catch (e) {
                console.error("Silent auto-login failed, showing onboarding carousel:", e);
            }
        }

        showScreen("carousel-screen");
        initVerticalScroll();
    }, 1500); // 1.5s loading animation
});
