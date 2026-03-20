(function () {
    'use strict';

    const STORAGE_KEY = 'blind-notes-page-tutorial-v3';
    const DEMO_UPLOAD_NAME = '示例文档.docx';
    const DEMO_PROMPT = '请先生成结构清晰的文档总结，再给我一组适合入门练习的例题。';

    const COMMUNITY_TUTORIAL_SAVE_KEY = 'blind-notes-community-tutorial-demo-save-v1';

    const state = {
        active: false,
        flow: null,
        stepIndex: 0,
        stepMeta: null,
        introAnnouncement: '',
        verifying: false,
        verifierTimer: null,
        currentTarget: null,
        lastReminderAt: 0,
    };

    let overlay = null;
    let spotlight = null;
    let panel = null;
    let progressNode = null;
    let titleNode = null;
    let bodyNode = null;
    let hintNode = null;

    function getStorage() {
        return window.sessionStorage || null;
    }

    function readSessionState() {
        const storage = getStorage();
        if (!storage) {
            return null;
        }
        try {
            const raw = storage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function writeSessionState(payload) {
        const storage = getStorage();
        if (!storage) {
            return;
        }
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function clearSessionState() {
        const storage = getStorage();
        if (!storage) {
            return;
        }
        storage.removeItem(STORAGE_KEY);
    }

    function normalizeKeyToken(event) {
        if (!event) {
            return '';
        }

        let base = '';
        if (event.code === 'NumpadAdd' || (event.code === 'Equal' && event.shiftKey) || event.key === '+') {
            base = '+';
        } else if (event.code === 'Space' || event.key === ' ') {
            base = 'space';
        } else if (event.key && event.key.length === 1) {
            base = event.key.toLowerCase();
        } else if (typeof event.key === 'string') {
            base = event.key.toLowerCase();
        } else if (typeof event.code === 'string') {
            base = event.code.toLowerCase();
        }

        if (base === 'arrowup' || base === 'arrowdown' || base === 'arrowleft' || base === 'arrowright') {
            return event.ctrlKey ? `ctrl+${base}` : base;
        }

        if (base === 'space') {
            return event.ctrlKey ? 'ctrl+space' : 'space';
        }

        if (event.ctrlKey && !event.altKey && !event.metaKey) {
            return `ctrl+${base}`;
        }

        return base;
    }

    function isEditableTarget(target) {
        if (!target) {
            return false;
        }
        const tagName = (target.tagName || '').toUpperCase();
        return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || !!target.isContentEditable;
    }

    function speak(text) {
        if (!text) {
            return;
        }

        if (typeof window.speakWithGlobalConfig === 'function') {
            window.speakWithGlobalConfig(text, { force: true, allowDuringTutorial: true });
            return;
        }

        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
            return;
        }

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (typeof window.configureSpeechUtterance === 'function') {
            window.configureSpeechUtterance(utterance);
        } else {
            utterance.lang = 'zh-CN';
            utterance.rate = typeof window._rate === 'number' ? window._rate : 1;
        }
        window.speechSynthesis.speak(utterance);
    }

    function maybeRemindCurrentStep() {
        const now = Date.now();
        if (now - state.lastReminderAt < 1200) {
            return;
        }
        state.lastReminderAt = now;
        const step = getCurrentStep();
        if (!step) {
            return;
        }
        speak(`这一步需要你按键完成。${step.description}`);
    }

    function getCurrentPageKey() {
        if (typeof window._tutorialPageKey === 'string' && window._tutorialPageKey) {
            return window._tutorialPageKey;
        }
        if (document.getElementById('uploadForm')) {
            return 'index';
        }
        if (document.getElementById('notes-tree')) {
            return 'my-notes';
        }
        if (document.getElementById('mistake-shortcut-text')) {
            return 'mistake-notebook';
        }
        if (document.getElementById('community-search-input')) {
            return 'community';
        }
        return '';
    }

    function getCurrentStep() {
        if (!state.flow || !Array.isArray(state.flow.steps)) {
            return null;
        }
        return state.flow.steps[state.stepIndex] || null;
    }

    function resolveTarget(target) {
        if (!target) {
            return document.querySelector('main') || document.body;
        }
        if (typeof target === 'function') {
            return resolveTarget(target());
        }
        if (typeof target === 'string') {
            return document.querySelector(target) || document.querySelector('main') || document.body;
        }
        return target;
    }

    function injectStyles() {
        if (document.getElementById('page-tutorial-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'page-tutorial-style';
        style.textContent = `
            body.tutorial-overlay-open {
                overflow: hidden;
            }

            #tutorial-overlay-root {
                position: fixed;
                inset: 0;
                z-index: 10080;
                display: none;
                pointer-events: none;
            }

            #tutorial-overlay-root.is-active {
                display: block;
            }

            #tutorial-spotlight {
                position: fixed;
                border-radius: 20px;
                background: rgba(255, 248, 240, 0.06);
                box-shadow:
                    0 0 0 9999px rgba(0, 0, 0, 0.94),
                    0 0 0 1px rgba(255, 210, 63, 0.7),
                    0 0 26px 8px rgba(247, 147, 30, 0.26),
                    inset 0 0 18px rgba(255, 255, 255, 0.16);
                transition: top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease;
            }

            #tutorial-panel {
                position: fixed;
                width: min(360px, calc(100vw - 32px));
                padding: 20px 22px 18px;
                border-radius: 22px;
                border: 1px solid rgba(255, 107, 53, 0.32);
                background: linear-gradient(180deg, rgba(255, 249, 242, 0.98), rgba(255, 242, 226, 0.98));
                box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
                color: var(--text-primary);
                transition: top 0.2s ease, left 0.2s ease;
            }

            #tutorial-panel::before {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: inherit;
                padding: 1px;
                background: linear-gradient(135deg, rgba(255, 107, 53, 0.44), rgba(255, 210, 63, 0.38));
                -webkit-mask:
                    linear-gradient(#fff 0 0) content-box,
                    linear-gradient(#fff 0 0);
                -webkit-mask-composite: xor;
                mask-composite: exclude;
                pointer-events: none;
            }

            .tutorial-progress {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 6px 12px;
                border-radius: 999px;
                background: rgba(255, 107, 53, 0.12);
                color: var(--primary-color);
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.04em;
                margin-bottom: 12px;
            }

            .tutorial-title {
                margin: 0 0 10px;
                font-size: 1.12rem;
                color: var(--text-primary);
            }

            .tutorial-body {
                margin: 0;
                color: var(--text-secondary);
                line-height: 1.8;
                white-space: pre-wrap;
            }

            .tutorial-hint {
                margin-top: 14px;
                font-size: 12px;
                color: var(--text-secondary);
            }

            .tutorial-demo-selection {
                margin-top: 12px;
                padding: 12px 14px;
                border-radius: 14px;
                background: rgba(255, 210, 63, 0.16);
                border: 1px solid rgba(255, 107, 53, 0.18);
                color: var(--text-primary);
                font-weight: 600;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureOverlay() {
        injectStyles();
        if (overlay) {
            return;
        }

        overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay-root';

        spotlight = document.createElement('div');
        spotlight.id = 'tutorial-spotlight';

        panel = document.createElement('div');
        panel.id = 'tutorial-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-live', 'assertive');
        panel.setAttribute('aria-modal', 'true');
        panel.tabIndex = -1;

        progressNode = document.createElement('div');
        progressNode.className = 'tutorial-progress';

        titleNode = document.createElement('h3');
        titleNode.className = 'tutorial-title';

        bodyNode = document.createElement('p');
        bodyNode.className = 'tutorial-body';

        hintNode = document.createElement('div');
        hintNode.className = 'tutorial-hint';

        panel.appendChild(progressNode);
        panel.appendChild(titleNode);
        panel.appendChild(bodyNode);
        panel.appendChild(hintNode);
        overlay.appendChild(spotlight);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
    }

    function positionOverlay(target) {
        const node = target || document.querySelector('main') || document.body;
        const rect = node.getBoundingClientRect();
        const padding = 12;
        const top = Math.max(10, rect.top - padding);
        const left = Math.max(10, rect.left - padding);
        const width = Math.max(56, Math.min(window.innerWidth - left - 10, rect.width + padding * 2));
        const height = Math.max(42, Math.min(window.innerHeight - top - 10, rect.height + padding * 2));

        spotlight.style.top = `${top}px`;
        spotlight.style.left = `${left}px`;
        spotlight.style.width = `${width}px`;
        spotlight.style.height = `${height}px`;

        const panelWidth = Math.min(360, window.innerWidth - 32);
        const panelHeight = panel.offsetHeight || 220;
        const gap = 24;
        let panelLeft = rect.right + gap;
        let panelTop = rect.top;

        if (panelLeft + panelWidth > window.innerWidth - 16) {
            panelLeft = rect.left - panelWidth - gap;
        }
        if (panelLeft < 16) {
            panelLeft = Math.max(16, Math.min(rect.left, window.innerWidth - panelWidth - 16));
            panelTop = rect.bottom + gap;
        }
        if (panelTop + panelHeight > window.innerHeight - 16) {
            panelTop = Math.max(16, window.innerHeight - panelHeight - 16);
        }

        panel.style.left = `${panelLeft}px`;
        panel.style.top = `${panelTop}px`;
    }

    function cleanupVerifier() {
        state.verifying = false;
        if (state.verifierTimer) {
            window.clearTimeout(state.verifierTimer);
            state.verifierTimer = null;
        }
    }

    function resetRuntimeState() {
        cleanupVerifier();
        state.active = false;
        state.flow = null;
        state.stepIndex = 0;
        state.stepMeta = null;
        state.introAnnouncement = '';
        state.currentTarget = null;
        window._tutorialActive = false;
        window._tutorialManagedByNewEngine = false;
    }

    function teardownOverlay() {
        if (overlay) {
            overlay.classList.remove('is-active');
        }
        document.body.classList.remove('tutorial-overlay-open');
    }

    function finishTutorial(reason, options) {
        const opts = options || {};
        const flow = state.flow;
        if (flow && typeof flow.onFinish === 'function') {
            flow.onFinish(reason);
        }

        clearCommunityTutorialDemoSaved();

        if (typeof window.stopCurrentSpeech === 'function') {
            window.stopCurrentSpeech();
        } else if (window.speechSynthesis && typeof window.speechSynthesis.cancel === 'function') {
            window.speechSynthesis.cancel();
        }

        clearSessionState();
        teardownOverlay();
        resetRuntimeState();

        if (opts.silent) {
            return;
        }

        if (reason === 'complete') {
            speak('当前页面的新手教程已完成。');
            return;
        }

        if (reason === 'cancelled') {
            speak('已退出新手教程。');
        }
    }

    function persistCurrentStep() {
        const step = getCurrentStep();
        if (!state.active || !state.flow || !step) {
            clearSessionState();
            return;
        }

        writeSessionState({
            version: 3,
            active: true,
            flowKey: state.flow.key,
            stepIndex: state.stepIndex,
        });
    }

    function advanceStep(options) {
        const opts = options || {};
        cleanupVerifier();
        state.stepIndex += 1;

        const nextStep = getCurrentStep();
        if (!nextStep) {
            finishTutorial('complete', { silent: !!opts.silentFinish });
            return;
        }

        persistCurrentStep();

        if (nextStep.pageKey === getCurrentPageKey()) {
            renderCurrentStep(opts.announce !== false);
        } else {
            teardownOverlay();
        }
    }

    function startVerifier(check, options) {
        const opts = options || {};
        const startedAt = Date.now();
        const pollMs = typeof opts.pollMs === 'number' ? opts.pollMs : 80;
        const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 1800;

        cleanupVerifier();
        state.verifying = true;

        function tick() {
            if (!state.active) {
                cleanupVerifier();
                return;
            }

            let passed = false;
            try {
                passed = !!check();
            } catch (error) {
                passed = false;
            }

            if (passed) {
                cleanupVerifier();
                advanceStep({ announce: opts.announceNext !== false, silentFinish: !!opts.silentFinish });
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                cleanupVerifier();
                maybeRemindCurrentStep();
                return;
            }

            state.verifierTimer = window.setTimeout(tick, pollMs);
        }

        state.verifierTimer = window.setTimeout(tick, pollMs);
    }

    function renderCurrentStep(announce) {
        const step = getCurrentStep();
        if (!step) {
            finishTutorial('complete');
            return;
        }

        ensureOverlay();
        overlay.classList.add('is-active');
        document.body.classList.add('tutorial-overlay-open');

        const target = resolveTarget(step.target);
        state.currentTarget = target;
        state.stepMeta = typeof step.onShow === 'function' ? step.onShow() || {} : {};

        const progressText = `${state.flow.title} ${state.stepIndex + 1} / ${state.flow.steps.length}`;
        progressNode.textContent = progressText;
        titleNode.textContent = step.title;
        bodyNode.textContent = step.description;
        hintNode.textContent = step.hint || '完成这一步后教程会自动继续。按 Esc 退出教程。';

        hintNode.textContent = step.hint || '按要求完成当前步骤后，教程会自动继续。';
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        }

        window.requestAnimationFrame(function () {
            positionOverlay(target);
            try {
                panel.focus({ preventScroll: true });
            } catch (error) {
                panel.focus();
            }
        });

        if (announce !== false) {
            const intro = state.introAnnouncement ? `${state.introAnnouncement}。` : '';
            state.introAnnouncement = '';
            const spokenBody = step.description || step.title || '';
            speak(`${intro}第${state.stepIndex + 1}步。${spokenBody}`);
            return;
        }

        if (announce !== false) {
            speak(`${progressText}。${step.title}。${step.description}。按 Esc 退出教程。`);
        }
    }

    function getAppUrl(name) {
        const urls = window._appUrls || {};
        return typeof urls[name] === 'string' ? urls[name] : '';
    }

    function ensureDemoSelection() {
        const fileInput = document.getElementById('file');
        if (!fileInput) {
            return;
        }

        fileInput.dataset.tutorialDemoSelected = '1';

        const promptInput = document.getElementById('prompt');
        if (promptInput && !promptInput.value.trim()) {
            promptInput.value = DEMO_PROMPT;
        }

        let note = document.getElementById('tutorial-demo-selection');
        if (!note) {
            note = document.createElement('div');
            note.id = 'tutorial-demo-selection';
            note.className = 'tutorial-demo-selection';
            fileInput.insertAdjacentElement('afterend', note);
        }
        note.textContent = `教程示例文档已就绪：${DEMO_UPLOAD_NAME}。现在可以按 Enter 进入示例处理流程。`;
    }

    function clearDemoSelection() {
        const fileInput = document.getElementById('file');
        if (fileInput) {
            delete fileInput.dataset.tutorialDemoSelected;
        }
        const note = document.getElementById('tutorial-demo-selection');
        if (note) {
            note.remove();
        }
    }

    function isDemoSelectionReady() {
        const fileInput = document.getElementById('file');
        return !!(fileInput && fileInput.dataset.tutorialDemoSelected === '1');
    }

    function getCommunityDemoSaveButton() {
        return document.querySelector('#community-post-list .community-post.is-selected button[data-save-post-id]') ||
            document.querySelector('#community-post-list button[data-save-post-id]') ||
            null;
    }

    function setCommunityTutorialDemoSaved(saved) {
        const storage = getStorage();
        if (storage) {
            try {
                if (saved) {
                    storage.setItem(COMMUNITY_TUTORIAL_SAVE_KEY, '1');
                } else {
                    storage.removeItem(COMMUNITY_TUTORIAL_SAVE_KEY);
                }
            } catch (error) {
                // Ignore session storage failures.
            }
        }

        const button = getCommunityDemoSaveButton();
        if (!button) {
            return;
        }

        if (saved) {
            if (!button.dataset.tutorialOriginalHtml) {
                button.dataset.tutorialOriginalHtml = button.innerHTML;
            }
            button.dataset.saved = '1';
            button.dataset.tutorialDemoSaved = '1';
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-check"></i> 已演示保存到我的笔记';
            return;
        }

        if (button.dataset.tutorialOriginalHtml) {
            button.innerHTML = button.dataset.tutorialOriginalHtml;
        }
        delete button.dataset.saved;
        delete button.dataset.tutorialDemoSaved;
        delete button.dataset.tutorialOriginalHtml;
        button.disabled = false;
    }

    function restoreCommunityTutorialDemoSaved() {
        const storage = getStorage();
        if (!storage) {
            return;
        }
        try {
            if (storage.getItem(COMMUNITY_TUTORIAL_SAVE_KEY) === '1') {
                setCommunityTutorialDemoSaved(true);
            }
        } catch (error) {
            // Ignore session storage failures.
        }
    }

    function clearCommunityTutorialDemoSaved() {
        setCommunityTutorialDemoSaved(false);
    }

    function getSummaryActiveHash() {
        const active = document.querySelector('#summary-toc a.active');
        return active ? active.getAttribute('href') || '' : '';
    }

    function getFirstDifficultyButton() {
        return document.querySelector('#difficulty-card [data-difficulty]');
    }

    function getQuizOptionButton(key) {
        const buttons = Array.from(document.querySelectorAll('#options-box .quiz-option-btn'));
        return buttons.find(function (button) {
            const keyNode = button.querySelector('.quiz-option-key');
            return keyNode && String(keyNode.textContent || '').trim().toUpperCase() === key;
        }) || null;
    }

    function getQuizContinueButton() {
        return document.querySelector('#feedback-actions .quiz-action-btn');
    }

    function getQuestionCardVisible() {
        const node = document.getElementById('question-card');
        return !!(node && node.style.display !== 'none');
    }

    function getFeedbackVisible() {
        const node = document.getElementById('feedback-box');
        return !!(node && node.style.display !== 'none');
    }

    function getDecisionVisible() {
        const node = document.getElementById('decision-card');
        return !!(node && node.style.display !== 'none');
    }

    function getSaveResultVisible() {
        const node = document.getElementById('save-note-result');
        return !!(node && node.style.display !== 'none' && node.textContent.trim());
    }

    function getCommunityUploadVisible() {
        const node = document.getElementById('community-upload-status');
        return !!(node && node.style.display !== 'none' && node.textContent.trim());
    }

    function isModalOpen(id) {
        const node = document.getElementById(id);
        return !!(node && node.classList.contains('is-open'));
    }

    function getMistakeDocumentName() {
        const node = document.getElementById('mistake-document-name');
        return node ? node.textContent.trim() : '';
    }

    function isMistakeQuestionVisible() {
        const node = document.getElementById('mistake-question-view');
        return !!(node && node.style.display !== 'none');
    }

    function isMistakeDocumentVisible() {
        const node = document.getElementById('mistake-document-view');
        return !!(node && node.style.display !== 'none');
    }

    function getMistakeDocumentCount() {
        const node = document.getElementById('mistake-position');
        const text = node ? node.textContent : '';
        const match = text && text.match(/\/\s*(\d+)/);
        return match ? Number(match[1]) : 1;
    }

    function getCommunitySelectedCard() {
        return document.querySelector('#community-post-list .community-post.is-selected') ||
            document.querySelector('#community-post-list .community-post') ||
            null;
    }

    function getCommunitySelectedId() {
        const card = getCommunitySelectedCard();
        return card ? card.id.replace(/^post-/, '') : '';
    }

    function getCommunityPostCards() {
        return Array.from(document.querySelectorAll('#community-post-list .community-post'));
    }

    function getNextCommunityCard() {
        const cards = getCommunityPostCards();
        if (cards.length < 2) {
            return null;
        }
        const currentId = getCommunitySelectedId();
        const currentIndex = cards.findIndex(function (card) {
            return card.id === `post-${currentId}`;
        });
        if (currentIndex < 0 || currentIndex >= cards.length - 1) {
            return null;
        }
        return cards[currentIndex + 1];
    }

    function getCommunityToggleButton() {
        const card = getCommunitySelectedCard();
        return card ? card.querySelector('button[data-toggle-post-id]') : null;
    }

    function getCommunitySaveButton() {
        const card = getCommunitySelectedCard();
        return card ? card.querySelector('button[data-save-post-id]') : null;
    }

    function isCommunityExpanded() {
        const card = getCommunitySelectedCard();
        if (!card) {
            return false;
        }
        const content = card.querySelector('.community-post-snippet');
        return !!(content && content.getAttribute('data-full') === '1');
    }

    function getCommunityPostCount() {
        return getCommunityPostCards().length;
    }

    function buildCommunitySpeechText() {
        const card = getCommunitySelectedCard();
        if (!card) {
            return '当前没有可朗读的帖子。';
        }

        const title = (card.querySelector('.community-post-title h3') || {}).textContent || '当前帖子';
        const body = (card.querySelector('.community-post-snippet') || {}).textContent || '';
        return `${title}。${body}`.trim();
    }

    function buildUploadFlow() {
        return {
            key: 'upload',
            title: '上传文档教程',
            onFinish: clearDemoSelection,
            steps: [
                {
                    pageKey: 'index',
                    title: '载入示例文档',
                    description: '按 U 载入教程示例文档。这里不会打开系统文件选择器，教程会直接代入一份示例文档，方便你练完整个流程。',
                    target: '#file',
                    keys: ['u'],
                    run: function (api) {
                        ensureDemoSelection();
                        api.next();
                    },
                },
                {
                    pageKey: 'index',
                    title: '开始示例处理',
                    description: '按 Enter 开始示例处理。教程会直接带你进入示例结果页。',
                    target: '#submitBtn',
                    keys: ['enter'],
                    run: function (api) {
                        const url = getAppUrl('tutorialDemoResult');
                        if (!isDemoSelectionReady() || !url) {
                            api.speak('请先按 U 载入示例文档。');
                            return;
                        }
                        api.navigate(url);
                    },
                },
                {
                    pageKey: 'tutorial-result',
                    title: '开始朗读文档总结',
                    description: '按 S 开始朗读示例总结。',
                    target: '#summary-speech-start',
                    keys: ['s'],
                    run: function (api) {
                        if (typeof window.playSummarySpeech === 'function') {
                            window.playSummarySpeech();
                        }
                        api.waitFor(function () {
                            return window._speechOwner === 'result-summary';
                        }, { announceNext: true });
                    },
                },
                {
                    pageKey: 'tutorial-result',
                    title: '切换到下一个标题',
                    description: '按右方向键跳到下一个标题，练习用标题导航阅读总结。',
                    target: '#summary-toc-panel',
                    keys: ['arrowright'],
                    onShow: function () {
                        return {
                            previousHash: getSummaryActiveHash(),
                            previousSectionIndex: typeof window._sectionIdx === 'number' ? window._sectionIdx : -1,
                        };
                    },
                    run: function (api) {
                        function triggerNextHeading() {
                            if (typeof window.speakNext !== 'function') {
                                return false;
                            }
                            return window.speakNext() === true;
                        }

                        if (!triggerNextHeading() && typeof window.playSummarySpeech === 'function') {
                            window.playSummarySpeech();
                            window.setTimeout(triggerNextHeading, 180);
                        }
                        api.waitFor(function () {
                            const currentHash = getSummaryActiveHash();
                            const currentIndex = typeof window._sectionIdx === 'number' ? window._sectionIdx : -1;
                            if (currentHash && currentHash !== api.meta.previousHash) {
                                return true;
                            }
                            return currentIndex > (typeof api.meta.previousSectionIndex === 'number' ? api.meta.previousSectionIndex : -1);
                        }, { announceNext: true, timeoutMs: 3200 });
                    },
                },
                {
                    pageKey: 'tutorial-result',
                    title: '进入例题闯关',
                    description: '按 E 从总结页进入示例习题闯关。',
                    target: '#btn-gen-exercise',
                    keys: ['e'],
                    run: function (api) {
                        api.navigate(getAppUrl('tutorialDemoChallenge'));
                    },
                },
                {
                    pageKey: 'tutorial-challenge',
                    title: '选择简单难度',
                    description: '按 1 进入第一组示例题。',
                    target: '#difficulty-card',
                    keys: ['1'],
                    run: function (api) {
                        const button = getFirstDifficultyButton();
                        if (!button) {
                            api.speak('当前没有可用的示例题目。');
                            return;
                        }
                        button.click();
                        api.waitFor(getQuestionCardVisible, { announceNext: true });
                    },
                },
                {
                    pageKey: 'tutorial-challenge',
                    title: '作答当前题目',
                    description: '按 A 回答第一题。教程示例会带你走一遍标准作答流程。',
                    target: '#options-box',
                    keys: ['a'],
                    run: function (api) {
                        const button = getQuizOptionButton('A');
                        if (!button) {
                            api.speak('当前题目还没有可用的 A 选项。');
                            return;
                        }
                        button.click();
                        api.waitFor(getFeedbackVisible, { announceNext: true });
                    },
                },
                {
                    pageKey: 'tutorial-challenge',
                    title: '进入完成判定',
                    description: '按右方向键继续。教程会带你进入这一组题目的完成判定页。',
                    target: '#feedback-actions',
                    keys: ['arrowright'],
                    run: function (api) {
                        const button = getQuizContinueButton();
                        if (!button) {
                            api.speak('当前还不能继续，请先完成作答。');
                            return;
                        }
                        button.click();
                        api.waitFor(getDecisionVisible, { announceNext: true });
                    },
                },
                {
                    pageKey: 'tutorial-challenge',
                    title: '结束示例闯关',
                    description: '按 E 结束示例闯关，并进入习题完成页。',
                    target: '#decision-actions',
                    keys: ['e'],
                    run: function (api) {
                        api.navigate(getAppUrl('tutorialDemoActions'));
                    },
                },
                {
                    pageKey: 'tutorial-actions',
                    title: '保存到我的笔记',
                    description: '按 M 把当前示例总结和习题保存到我的笔记。',
                    target: '#save-current-note-button',
                    keys: ['m'],
                    run: function (api) {
                        const button = document.getElementById('save-current-note-button');
                        if (!button) {
                            api.speak('当前页面没有保存到我的笔记按钮。');
                            return;
                        }
                        button.click();
                        api.waitFor(getSaveResultVisible, { announceNext: true });
                    },
                },
                {
                    pageKey: 'tutorial-actions',
                    title: '上传到学习社区',
                    description: '按 U 把当前示例总结和习题一起上传到学习社区。上传成功后，本次上传文档教程就完成了。',
                    target: '#btn-upload-to-community',
                    keys: ['u'],
                    run: function (api) {
                        const button = document.getElementById('btn-upload-to-community');
                        if (!button) {
                            api.speak('当前页面没有上传到学习社区按钮。');
                            return;
                        }
                        button.click();
                        api.waitFor(getCommunityUploadVisible, { announceNext: false, silentFinish: true });
                    },
                },
            ],
        };
    }

    function buildMyNotesFlow() {
        return {
            key: 'my-notes',
            title: '我的笔记教程',
            steps: [
                {
                    pageKey: 'my-notes',
                    title: '新建文件夹',
                    description: '按加号键打开新建文件夹窗口。',
                    target: '#open-create-folder',
                    keys: ['+'],
                    run: function (api) {
                        if (typeof window.openCreateFolderModal === 'function') {
                            window.openCreateFolderModal();
                        } else {
                            const button = document.getElementById('open-create-folder');
                            if (button) {
                                button.click();
                            }
                        }
                        api.waitFor(function () {
                            return isModalOpen('create-folder-modal');
                        }, { announceNext: true });
                    },
                },
                {
                    pageKey: 'my-notes',
                    title: '退出新建文件夹窗口',
                    description: '按 Esc 关闭新建文件夹窗口。',
                    target: '#create-folder-modal',
                    keys: ['escape'],
                    run: function (api) {
                        const button = document.getElementById('cancel-create-folder');
                        if (button) {
                            button.click();
                        }
                        api.waitFor(function () {
                            return !isModalOpen('create-folder-modal');
                        }, { announceNext: true });
                    },
                },
                {
                    pageKey: 'my-notes',
                    title: '打开 AI 助手',
                    description: '按 Ctrl 加空格键打开我的笔记里的 AI 助手。',
                    target: '#ai-sprite-btn',
                    keys: ['ctrl+space'],
                    run: function (api) {
                        if (typeof window.openAIAssistant === 'function') {
                            const wasTutorialActive = window._tutorialActive;
                            window._tutorialActive = false;
                            try {
                                window.openAIAssistant({ focusInput: true, speakPrompt: false });
                            } finally {
                                window._tutorialActive = wasTutorialActive;
                            }
                        }
                        api.waitFor(function () {
                            return !!window._aiWindowOpen;
                        }, { announceNext: true });
                    },
                },
                {
                    pageKey: 'my-notes',
                    title: '退出 AI 助手',
                    description: '按 Esc 关闭 AI 助手。这样你就完成了我的笔记基础操作和 AI 助手教程。',
                    target: '#ai-window',
                    keys: ['escape'],
                    run: function (api) {
                        if (typeof window.closeAIAssistant === 'function') {
                            window.closeAIAssistant();
                        }
                        api.waitFor(function () {
                            return !window._aiWindowOpen;
                        }, { announceNext: false, silentFinish: true });
                    },
                },
            ],
        };
    }

    function buildMistakeFlow() {
        if (!document.getElementById('mistake-document-view')) {
            return {
                key: 'mistake-notebook',
                title: '错题本新手教程',
                steps: [
                    {
                        pageKey: 'mistake-notebook',
                        title: '当前暂无错题',
                        description: '当前还没有可演示的错题内容。按 Esc 结束教程，之后做错的题目会自动加入错题本。',
                        target: '.card',
                        keys: ['escape'],
                        run: function (api) {
                            api.next({ announce: false, silentFinish: true });
                        },
                    },
                ],
            };
        }

        const steps = [];
        const hasMultipleDocuments = getMistakeDocumentCount() > 1;

        if (hasMultipleDocuments) {
            steps.push({
                pageKey: 'mistake-notebook',
                title: '切换文档',
                description: '按右方向键切换到下一份有错题的文档。',
                target: '#mistake-next-button',
                keys: ['arrowright'],
                onShow: function () {
                    return { previousName: getMistakeDocumentName() };
                },
                run: function (api) {
                    const button = document.getElementById('mistake-next-button');
                    if (button) {
                        button.click();
                    }
                    api.waitFor(function () {
                        const currentName = getMistakeDocumentName();
                        return !!currentName && currentName !== api.meta.previousName;
                    }, { announceNext: true });
                },
            });
        }

        steps.push({
            pageKey: 'mistake-notebook',
            title: '打开当前文档的错题',
            description: '按 Enter 打开当前文档里的错题列表。',
            target: '#mistake-document-view',
            keys: ['enter'],
            mode: 'passthrough',
            verify: function () {
                return isMistakeQuestionVisible();
            },
        });

        steps.push({
            pageKey: 'mistake-notebook',
            title: '返回文档列表',
            description: '按 Backspace 返回错题文档列表。这就是错题本最常用的进出流程。',
            target: '#mistake-back-to-docs',
            keys: ['backspace'],
            run: function (api) {
                const button = document.getElementById('mistake-back-to-docs');
                if (button) {
                    button.click();
                }
                api.waitFor(function () {
                    return isMistakeDocumentVisible() && !isMistakeQuestionVisible();
                }, { announceNext: false, silentFinish: true });
            },
        });

        return {
            key: 'mistake-notebook',
            title: '错题本教程',
            steps: steps,
        };
    }

    function buildCommunityFlow() {
        const steps = [
            {
                pageKey: 'community',
                title: '聚焦搜索框',
                description: '按斜杠键把焦点移动到学习社区搜索框。',
                target: '#community-search-input',
                keys: ['/'],
                run: function (api) {
                    const input = document.getElementById('community-search-input');
                    if (input) {
                        input.focus();
                        if (typeof input.select === 'function') {
                            input.select();
                        }
                    }
                    api.waitFor(function () {
                        return document.activeElement === input;
                    }, { announceNext: true });
                },
            },
        ];

        if (getCommunityPostCount() > 1) {
            steps.push({
                pageKey: 'community',
                title: '切换当前帖子',
                description: '按下方向键切换到下一条帖子。',
                target: '#community-post-list',
                keys: ['arrowdown'],
                onShow: function () {
                    return { previousId: getCommunitySelectedId() };
                },
                run: function (api) {
                    const nextCard = getNextCommunityCard();
                    if (nextCard) {
                        nextCard.click();
                    }
                    api.waitFor(function () {
                        const currentId = getCommunitySelectedId();
                        return !!currentId && currentId !== api.meta.previousId;
                    }, { announceNext: true });
                },
            });
        }

        steps.push({
            pageKey: 'community',
            title: '展开当前帖子',
            description: '按 Enter 展开当前帖子，查看完整内容。',
            target: function () {
                return getCommunityToggleButton() || '#community-post-list';
            },
            keys: ['enter'],
            run: function (api) {
                const button = getCommunityToggleButton();
                if (button) {
                    button.click();
                }
                api.waitFor(isCommunityExpanded, { announceNext: true });
            },
        });

        steps.push({
            pageKey: 'community',
            title: '保存到我的笔记',
            description: '按 U 把当前帖子保存到我的笔记。',
            target: function () {
                return getCommunitySaveButton() || '#community-post-list';
            },
            keys: ['u'],
            run: function (api) {
                const button = getCommunitySaveButton();
                if (!button) {
                    api.speak('当前帖子暂时不能保存到我的笔记。');
                    return;
                }
                setCommunityTutorialDemoSaved(true);
                api.waitFor(function () {
                    return button.dataset.saved === '1';
                }, { announceNext: true, timeoutMs: 600 });
            },
        });

        steps.push({
            pageKey: 'community',
            title: '朗读当前帖子',
            description: '按 L 朗读当前帖子内容。完成这一步后，学习社区教程就结束了。',
            target: '#community-post-list',
            keys: ['l'],
            run: function (api) {
                speak(buildCommunitySpeechText());
                api.next({ announce: false, silentFinish: true });
            },
        });

        return {
            key: 'community',
            title: '学习社区教程',
            steps: steps,
        };
    }

    function getAvailableFlowForPage(pageKey) {
        if (pageKey === 'index') {
            return buildUploadFlow();
        }
        if (pageKey === 'my-notes') {
            return buildMyNotesFlow();
        }
        if (pageKey === 'mistake-notebook') {
            return buildMistakeFlow();
        }
        if (pageKey === 'community') {
            return buildCommunityFlow();
        }
        return null;
    }

    function getFlowByKey(flowKey) {
        if (flowKey === 'upload') {
            return buildUploadFlow();
        }
        if (flowKey === 'my-notes') {
            return buildMyNotesFlow();
        }
        if (flowKey === 'mistake-notebook') {
            return buildMistakeFlow();
        }
        if (flowKey === 'community') {
            return buildCommunityFlow();
        }
        return null;
    }

    function startFlow(flow) {
        if (!flow || !Array.isArray(flow.steps) || !flow.steps.length) {
            speak('当前页面暂时没有可用的新手教程。');
            return;
        }

        if (window._aiWindowOpen && typeof window.closeAIAssistant === 'function') {
            window.closeAIAssistant();
        }

        state.active = true;
        state.flow = flow;
        state.stepIndex = 0;
        state.stepMeta = null;
        state.introAnnouncement = '新手教程开始，按 Esc 随时退出';
        state.currentTarget = null;
        state.lastReminderAt = 0;
        window._tutorialActive = true;
        window._tutorialManagedByNewEngine = true;

        persistCurrentStep();
        renderCurrentStep(true);
    }

    function startTutorial() {
        startFlow(getAvailableFlowForPage(getCurrentPageKey()));
    }

    function resumeTutorialIfNeeded() {
        const saved = readSessionState();
        if (!saved || !saved.active || !saved.flowKey) {
            return;
        }

        const flow = getFlowByKey(saved.flowKey);
        if (!flow || !Array.isArray(flow.steps) || !flow.steps.length) {
            clearSessionState();
            return;
        }

        const step = flow.steps[saved.stepIndex];
        if (!step) {
            clearSessionState();
            return;
        }

        if (step.pageKey !== getCurrentPageKey()) {
            return;
        }

        state.active = true;
        state.flow = flow;
        state.stepIndex = saved.stepIndex;
        state.stepMeta = null;
        state.introAnnouncement = '';
        state.currentTarget = null;
        state.lastReminderAt = 0;
        window._tutorialActive = true;
        window._tutorialManagedByNewEngine = true;
        renderCurrentStep(true);
    }

    function bindTrigger() {
        const button = document.getElementById('page-tutorial-trigger');
        if (!button) {
            return;
        }

        button.addEventListener('click', function (event) {
            event.preventDefault();
            startTutorial();
        });
    }

    function matchStepHotkey(step, token) {
        const keys = Array.isArray(step.keys) ? step.keys : [];
        return keys.indexOf(token) >= 0;
    }

    function buildApi(step, event, token) {
        return {
            event: event,
            token: token,
            step: step,
            meta: state.stepMeta || {},
            prevent: function () {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            },
            next: function (options) {
                advanceStep(options);
            },
            waitFor: function (check, options) {
                startVerifier(check, options);
            },
            navigate: function (url, options) {
                const opts = options || {};
                if (!url) {
                    maybeRemindCurrentStep();
                    return;
                }
                advanceStep({ announce: false });
                window.setTimeout(function () {
                    window.location.href = url;
                }, typeof opts.delayMs === 'number' ? opts.delayMs : 80);
            },
            speak: speak,
        };
    }

    function handleStepKeydown(event) {
        if (!state.active) {
            return false;
        }

        const step = getCurrentStep();
        if (!step) {
            finishTutorial('complete');
            return true;
        }

        const token = normalizeKeyToken(event);
        const escapeIsAction = matchStepHotkey(step, 'escape');

        if (token === 'escape' && !escapeIsAction) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            finishTutorial('cancelled');
            return true;
        }

        if (state.verifying) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return true;
        }

        if (!matchStepHotkey(step, token)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            maybeRemindCurrentStep();
            return true;
        }

        if (step.mode === 'passthrough') {
            if (typeof step.beforePassThrough === 'function') {
                step.beforePassThrough(buildApi(step, event, token));
            }
            if (typeof step.verify === 'function') {
                startVerifier(function () {
                    return step.verify(state.stepMeta || {});
                }, { announceNext: true });
            } else {
                advanceStep();
            }
            return false;
        }

        const api = buildApi(step, event, token);
        api.prevent();

        if (typeof step.run === 'function') {
            step.run(api);
            return true;
        }

        advanceStep();
        return true;
    }

    function onWindowKeydown(event) {
        if (handleStepKeydown(event)) {
            return;
        }

        if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
            return;
        }

        if (normalizeKeyToken(event) !== 'f') {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        startTutorial();
    }

    function handleViewportChange() {
        if (!state.active || !state.currentTarget) {
            return;
        }
        positionOverlay(state.currentTarget);
    }

    function init() {
        window.startTutorial = startTutorial;
        window.skipTutorial = function () {
            finishTutorial('cancelled');
        };
        window._tutorialManagedByNewEngine = false;

        ensureOverlay();
        bindTrigger();
        window.addEventListener('keydown', onWindowKeydown, true);
        window.addEventListener('resize', handleViewportChange);
        document.addEventListener('scroll', handleViewportChange, true);
        restoreCommunityTutorialDemoSaved();
        resumeTutorialIfNeeded();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
