(function () {
    'use strict';

    const STORAGE_KEY = 'blind-notes-tutorial-v2';
    const STATE_VERSION = 2;

    const steps = [
        {
            page: 'index',
            keyLabel: 'U',
            matches: ['u'],
            title: '选择示例文档',
            description: '按 U 选择教程自带的示例文档。这里会直接使用“示例文档.docx”继续，不需要真的上传文件。',
            target: function () {
                return document.getElementById('file') || document.getElementById('submitBtn');
            },
            action: function () {
                showDemoSelection();
            },
        },
        {
            page: 'index',
            keyLabel: 'Enter',
            matches: ['enter'],
            title: '开始处理',
            description: '按 Enter 开始处理示例文档。教程会直接进入示例结果页，模拟文档已经上传完成。',
            target: function () {
                return document.getElementById('submitBtn');
            },
            onEnter: function () {
                showDemoSelection();
            },
            action: function () {
                showDemoSelection();
                if (typeof window.setProcessingUi === 'function') {
                    window.setProcessingUi(true);
                }
                return {
                    navigateTo: getAppUrl('tutorialDemoResult'),
                    delay: 420,
                };
            },
        },
        {
            page: 'tutorial-result',
            keyLabel: 'S',
            matches: ['s'],
            title: '朗读总结',
            description: '按 S 朗读示例文档总结。这是结果页最常用的快捷键。',
            target: function () {
                return document.getElementById('summary-speech-start');
            },
            action: function () {
                if (typeof window.playSummarySpeech === 'function') {
                    window.playSummarySpeech();
                }
            },
        },
        {
            page: 'tutorial-result',
            keyLabel: 'Space',
            matches: ['space'],
            title: '暂停朗读',
            description: '按空格暂停当前朗读。想停下来思考时，用这一键最快。',
            target: function () {
                return document.getElementById('summary-speech-toggle');
            },
            onEnter: function () {
                ensureSummaryPlayback();
            },
            action: function () {
                if (typeof window.toggleCurrentSpeechPause === 'function') {
                    window.toggleCurrentSpeechPause();
                }
            },
        },
        {
            page: 'tutorial-result',
            keyLabel: 'Space',
            matches: ['space'],
            title: '继续朗读',
            description: '再按一次空格继续刚才的朗读。暂停和继续都用同一个键。',
            target: function () {
                return document.getElementById('summary-speech-toggle');
            },
            action: function () {
                if (typeof window.toggleCurrentSpeechPause === 'function') {
                    window.toggleCurrentSpeechPause();
                }
            },
        },
        {
            page: 'tutorial-result',
            keyLabel: 'X',
            matches: ['x'],
            title: '停止朗读',
            description: '按 X 立即停止朗读。切换去做题或上传新文档前，经常会用到。',
            target: function () {
                return document.getElementById('summary-speech-stop');
            },
            onEnter: function () {
                ensureSummaryPlayback();
            },
            action: function () {
                if (typeof window.stopCurrentSpeech === 'function') {
                    window.stopCurrentSpeech();
                }
            },
        },
        {
            page: 'tutorial-result',
            keyLabel: 'Ctrl + ↑',
            matches: ['ctrl+arrowup'],
            title: '调快语速',
            description: '按 Ctrl 加上方向键提高语速。这样不会和页面滚动冲突。',
            target: function () {
                return document.getElementById('global-rate-slider');
            },
            action: function () {
                if (typeof window.increaseRate === 'function') {
                    window.increaseRate();
                }
            },
        },
        {
            page: 'tutorial-result',
            keyLabel: 'Ctrl + ↓',
            matches: ['ctrl+arrowdown'],
            title: '调慢语速',
            description: '按 Ctrl 加下方向键放慢语速。遇到难点时更适合精听。',
            target: function () {
                return document.getElementById('global-rate-slider');
            },
            action: function () {
                if (typeof window.decreaseRate === 'function') {
                    window.decreaseRate();
                }
            },
        },
        {
            page: 'tutorial-result',
            keyLabel: 'E',
            matches: ['e'],
            title: '进入题目闯关',
            description: '按 E 进入示例题目闯关。文档处理完成后，这个快捷键能最快开始练习。',
            target: function () {
                return document.getElementById('btn-gen-exercise');
            },
            action: function () {
                return {
                    navigateTo: getAppUrl('tutorialDemoChallenge') || getElementHref(document.getElementById('btn-gen-exercise')),
                    delay: 160,
                };
            },
        },
        {
            page: 'tutorial-challenge',
            keyLabel: '1',
            matches: ['1'],
            title: '选择难度',
            description: '按 1 选择简单模式。题目页支持 1 到 4 在键盘上直接切换难度。',
            target: function () {
                return document.querySelector('[data-difficulty="Easy"], [data-difficulty="简单"]');
            },
            action: function () {
                const button = document.querySelector('[data-difficulty="Easy"], [data-difficulty="简单"]');
                if (button) {
                    button.click();
                }
            },
        },
        {
            page: 'tutorial-challenge',
            keyLabel: 'A',
            matches: ['a'],
            title: '键盘作答',
            description: '按 A 选择 A 选项。进入题目后，可以直接用 A 到 D 作答，不需要鼠标。',
            target: function () {
                return document.querySelector('#options-box .quiz-option-btn');
            },
            action: function () {
                const button = document.querySelector('#options-box .quiz-option-btn');
                if (button) {
                    button.click();
                }
            },
        },
        {
            page: 'tutorial-challenge',
            keyLabel: 'M',
            matches: ['m'],
            title: '我的笔记',
            description: '按 M 打开“我的笔记”。完成答题并保存后的文档会在这里归档；平时可以用 Tab 在文件夹和笔记卡片之间移动，再按 Enter 打开。',
            target: function () {
                return findLinkByUrl(getAppUrl('myNotes'));
            },
            action: function () {
                return {
                    navigateTo: getAppUrl('myNotes'),
                    delay: 140,
                };
            },
        },
        {
            page: 'my-notes',
            keyLabel: 'C',
            matches: ['c'],
            title: '文件夹与归档',
            description: '这里可以先新建文件夹，再把完成闯关的文档保存进来。现在按 C 去学习社区看看。',
            target: function () {
                return document.getElementById('folder-name') || findLinkByUrl(getAppUrl('myNotes'));
            },
            action: function () {
                return {
                    navigateTo: getAppUrl('community'),
                    delay: 140,
                };
            },
        },
        {
            page: 'community',
            keyLabel: '/',
            matches: ['/'],
            title: '搜索社区帖子',
            description: '在学习社区里按 / 聚焦搜索框，然后输入关键词就能筛选帖子。结果页的“上传到学习社区”会把当前总结发到这里。',
            target: function () {
                return document.getElementById('community-search-input');
            },
            action: function () {
                focusCommunitySearch();
            },
        },
        {
            page: 'community',
            keyLabel: 'Enter',
            matches: ['enter'],
            title: '完成教程',
            description: '按 Enter 结束教程。之后你可以随时从侧边栏重新打开新手教程。',
            target: function () {
                return document.getElementById('community-search-input');
            },
            action: function () {
                finishTutorial();
                return { skipAdvance: true };
            },
        },
    ];

    let overlay = null;
    let spotlight = null;
    let panel = null;
    let progressNode = null;
    let titleNode = null;
    let bodyNode = null;
    let keyNode = null;
    let hintNode = null;

    function injectStyles() {
        if (document.getElementById('tutorial-overlay-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'tutorial-overlay-style';
        style.textContent = `
            body.tutorial-overlay-open {
                overflow: hidden;
            }

            #tutorial-overlay-root {
                position: fixed;
                inset: 0;
                z-index: 10080;
                pointer-events: none;
            }

            #tutorial-overlay-root.is-hidden {
                display: none;
            }

            #tutorial-spotlight {
                position: fixed;
                border-radius: 20px;
                background: rgba(255, 248, 240, 0.06);
                box-shadow:
                    0 0 0 9999px rgba(6, 3, 0, 0.94),
                    0 0 0 1px rgba(255, 210, 63, 0.72),
                    0 0 26px 8px rgba(247, 147, 30, 0.28),
                    0 0 58px 18px rgba(255, 107, 53, 0.26),
                    inset 0 0 20px rgba(255, 255, 255, 0.16);
                transition: top 0.24s ease, left 0.24s ease, width 0.24s ease, height 0.24s ease;
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
                pointer-events: auto;
                transition: top 0.24s ease, left 0.24s ease;
                outline: none;
            }

            #tutorial-panel::before {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: inherit;
                padding: 1px;
                background: linear-gradient(135deg, rgba(255, 107, 53, 0.45), rgba(255, 210, 63, 0.38));
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

            .tutorial-key {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 74px;
                padding: 8px 14px;
                margin-top: 16px;
                border-radius: 999px;
                background: linear-gradient(135deg, rgba(255, 107, 53, 0.16), rgba(255, 210, 63, 0.26));
                color: var(--primary-color);
                font-weight: 800;
                letter-spacing: 0.06em;
            }

            .tutorial-hint {
                margin-top: 12px;
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
        overlay.className = 'is-hidden';

        spotlight = document.createElement('div');
        spotlight.id = 'tutorial-spotlight';

        panel = document.createElement('div');
        panel.id = 'tutorial-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-live', 'assertive');
        panel.tabIndex = -1;

        progressNode = document.createElement('div');
        progressNode.className = 'tutorial-progress';

        titleNode = document.createElement('h3');
        titleNode.className = 'tutorial-title';

        bodyNode = document.createElement('p');
        bodyNode.className = 'tutorial-body';

        keyNode = document.createElement('div');
        keyNode.className = 'tutorial-key';

        hintNode = document.createElement('div');
        hintNode.className = 'tutorial-hint';
        hintNode.textContent = '按 Esc 跳过教程';

        panel.appendChild(progressNode);
        panel.appendChild(titleNode);
        panel.appendChild(bodyNode);
        panel.appendChild(keyNode);
        panel.appendChild(hintNode);

        overlay.appendChild(spotlight);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
    }

    function getAppUrl(name) {
        const urls = window._appUrls || {};
        return typeof urls[name] === 'string' ? urls[name] : '';
    }

    function normalizeKey(event) {
        if (!event || typeof event.key !== 'string') {
            return '';
        }
        if (event.ctrlKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            return `ctrl+${event.key.toLowerCase()}`;
        }
        if (event.key === ' ') {
            return 'space';
        }
        return event.key.toLowerCase();
    }

    function isEditableTarget(target) {
        if (!target) {
            return false;
        }
        const tagName = (target.tagName || '').toUpperCase();
        return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || !!target.isContentEditable;
    }

    function getCurrentPage() {
        if (typeof window._tutorialPageKey === 'string' && window._tutorialPageKey) {
            return window._tutorialPageKey;
        }
        if (document.getElementById('uploadForm')) {
            return 'index';
        }
        if (document.getElementById('community-search-input')) {
            return 'community';
        }
        if (document.getElementById('folder-name')) {
            return 'my-notes';
        }
        if (document.getElementById('difficulty-card')) {
            return 'exercise-challenge';
        }
        if (document.getElementById('summary-rendered')) {
            return 'result';
        }
        return '';
    }

    function loadState() {
        if (!window.sessionStorage) {
            return null;
        }
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== STATE_VERSION) {
                return null;
            }
            return parsed;
        } catch (error) {
            return null;
        }
    }

    function saveState(state) {
        if (!window.sessionStorage) {
            return;
        }
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function clearState() {
        if (!window.sessionStorage) {
            return;
        }
        window.sessionStorage.removeItem(STORAGE_KEY);
    }

    function getCurrentStep() {
        const state = loadState();
        if (!state || !state.active) {
            return null;
        }
        return steps[state.stepIndex] || null;
    }

    function getStateOrDefault() {
        return (
            loadState() || {
                version: STATE_VERSION,
                active: false,
                stepIndex: 0,
                originUrl: '',
            }
        );
    }

    function findLinkByUrl(url) {
        if (!url) {
            return null;
        }
        let targetPath = '';
        try {
            targetPath = new URL(url, window.location.origin).pathname;
        } catch (error) {
            targetPath = url;
        }
        const links = Array.from(document.querySelectorAll('a[href]'));
        return (
            links.find(function (link) {
                try {
                    return new URL(link.href, window.location.origin).pathname === targetPath;
                } catch (error) {
                    return false;
                }
            }) || null
        );
    }

    function getElementHref(node) {
        if (!node || !node.href) {
            return '';
        }
        return node.href;
    }

    function showDemoSelection() {
        const fileInput = document.getElementById('file');
        if (!fileInput || document.getElementById('tutorial-demo-selection')) {
            return;
        }
        const badge = document.createElement('div');
        badge.id = 'tutorial-demo-selection';
        badge.className = 'tutorial-demo-selection';
        badge.textContent = '教程已选择：示例文档.docx';
        fileInput.insertAdjacentElement('afterend', badge);
    }

    function removeDemoSelection() {
        const badge = document.getElementById('tutorial-demo-selection');
        if (badge) {
            badge.remove();
        }
    }

    function ensureSummaryPlayback() {
        if (!window.speechSynthesis || typeof window.playSummarySpeech !== 'function') {
            return;
        }
        if (window.speechSynthesis.speaking || window.speechSynthesis.paused) {
            return;
        }
        window.playSummarySpeech();
    }

    function focusCommunitySearch() {
        const input = document.getElementById('community-search-input');
        if (!input) {
            return;
        }
        input.focus();
        if (typeof input.select === 'function') {
            input.select();
        }
    }

    function hideHelpOverlayIfNeeded() {
        const help = document.getElementById('help-overlay');
        if (help) {
            help.remove();
        }
        window._helpOverlayOpen = false;
    }

    function positionOverlay(target) {
        if (!overlay || !spotlight || !panel || !target) {
            return;
        }

        const rect = target.getBoundingClientRect();
        const padding = 12;
        const top = Math.max(10, rect.top - padding);
        const left = Math.max(10, rect.left - padding);
        const width = Math.min(window.innerWidth - left - 10, rect.width + padding * 2);
        const height = Math.min(window.innerHeight - top - 10, rect.height + padding * 2);

        spotlight.style.top = `${top}px`;
        spotlight.style.left = `${left}px`;
        spotlight.style.width = `${Math.max(width, 56)}px`;
        spotlight.style.height = `${Math.max(height, 42)}px`;

        const panelWidth = Math.min(360, window.innerWidth - 32);
        const gap = 26;
        let panelLeft = rect.right + gap;
        let panelTop = rect.top - 6;

        if (panelLeft + panelWidth > window.innerWidth - 16) {
            panelLeft = rect.left - panelWidth - gap;
        }
        if (panelLeft < 16) {
            panelLeft = Math.max(16, Math.min(rect.left, window.innerWidth - panelWidth - 16));
            panelTop = rect.bottom + gap;
        }

        const panelHeight = panel.offsetHeight || 220;
        if (panelTop + panelHeight > window.innerHeight - 16) {
            panelTop = Math.max(16, window.innerHeight - panelHeight - 16);
        }
        if (panelTop < 16) {
            panelTop = 16;
        }

        panel.style.left = `${panelLeft}px`;
        panel.style.top = `${panelTop}px`;
    }

    function renderCurrentStep() {
        const state = loadState();
        const step = getCurrentStep();
        if (!state || !state.active || !step) {
            hideOverlay();
            window._tutorialActive = false;
            window._tutorialStep = 0;
            return;
        }

        if (getCurrentPage() !== step.page) {
            return;
        }

        ensureOverlay();
        overlay.classList.remove('is-hidden');
        document.body.classList.add('tutorial-overlay-open');
        window._tutorialActive = true;
        window._tutorialStep = state.stepIndex;

        if (typeof step.onEnter === 'function') {
            step.onEnter();
        }

        const target = typeof step.target === 'function' ? step.target() : null;
        if (!target) {
            window.setTimeout(renderCurrentStep, 120);
            return;
        }

        if (typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        }

        progressNode.textContent = `新手教程 ${state.stepIndex + 1} / ${steps.length}`;
        titleNode.textContent = step.title;
        bodyNode.textContent = step.description;
        keyNode.textContent = `按 ${step.keyLabel}`;

        window.requestAnimationFrame(function () {
            positionOverlay(target);
            panel.focus({ preventScroll: true });
        });
    }

    function hideOverlay() {
        if (!overlay) {
            return;
        }
        overlay.classList.add('is-hidden');
        document.body.classList.remove('tutorial-overlay-open');
    }

    function getReturnUrl(state) {
        const fallback = getAppUrl('index') || '/';
        if (!state || !state.originUrl) {
            return fallback;
        }
        const originUrl = state.originUrl;
        if (originUrl.indexOf('/tutorial/demo/') !== -1) {
            return fallback;
        }
        return originUrl;
    }

    function finishTutorial(keepCurrentPage) {
        const state = getStateOrDefault();
        clearState();
        hideOverlay();
        removeDemoSelection();
        window._tutorialActive = false;
        window._tutorialStep = 0;

        if (keepCurrentPage === false && window.location.pathname.indexOf('/tutorial/demo/') === 0) {
            window.location.href = getReturnUrl(state);
        }
    }

    function skipTutorial() {
        finishTutorial(false);
    }

    function advanceTutorial() {
        const state = loadState();
        const step = getCurrentStep();
        if (!state || !step) {
            return;
        }

        const command = typeof step.action === 'function' ? step.action() || {} : {};
        if (command.skipAdvance) {
            return;
        }

        const nextState = {
            ...state,
            stepIndex: state.stepIndex + 1,
        };
        saveState(nextState);
        window._tutorialStep = nextState.stepIndex;

        if (nextState.stepIndex >= steps.length) {
            finishTutorial(true);
            return;
        }

        if (command.navigateTo) {
            window.setTimeout(function () {
                window.location.href = command.navigateTo;
            }, typeof command.delay === 'number' ? command.delay : 0);
            return;
        }

        window.setTimeout(renderCurrentStep, typeof command.delay === 'number' ? command.delay : 120);
    }

    function startTutorial() {
        if (!window._currentUsername) {
            return;
        }

        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        if (window._aiWindowOpen && typeof window.closeAIAssistant === 'function') {
            window.closeAIAssistant();
        }
        hideHelpOverlayIfNeeded();

        saveState({
            version: STATE_VERSION,
            active: true,
            stepIndex: 0,
            originUrl: window.location.href,
        });

        window._tutorialActive = true;
        window._tutorialStep = 0;

        if (getCurrentPage() !== 'index') {
            const indexUrl = getAppUrl('index');
            if (indexUrl) {
                window.location.href = indexUrl;
            }
            return;
        }

        renderCurrentStep();
    }

    function matchesStep(step, key) {
        return Array.isArray(step.matches) && step.matches.indexOf(key) !== -1;
    }

    function handleTutorialHotkeys(event) {
        const state = loadState();
        if (!state || !state.active) {
            return;
        }

        const key = normalizeKey(event);
        if (key === 'escape') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            skipTutorial();
            return;
        }

        const step = getCurrentStep();
        if (!step || step.page !== getCurrentPage()) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (!matchesStep(step, key)) {
            return;
        }

        advanceTutorial();
    }

    function handleGlobalNavigationHotkeys(event) {
        if (window._tutorialActive || window._helpOverlayOpen || window._aiWindowOpen) {
            return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        if (isEditableTarget(event.target)) {
            return;
        }

        const key = normalizeKey(event);
        const page = getCurrentPage();

        if (key === 'm' && page !== 'my-notes') {
            const myNotesUrl = getAppUrl('myNotes');
            if (!myNotesUrl) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            window.location.href = myNotesUrl;
            return;
        }

        if (key === 'c' && page !== 'tutorial-challenge' && page !== 'exercise-challenge' && page !== 'community') {
            const communityUrl = getAppUrl('community');
            if (!communityUrl) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            window.location.href = communityUrl;
            return;
        }

        if (key === '/' && page === 'community') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            focusCommunitySearch();
        }
    }

    function resumeTutorialIfNeeded() {
        const state = loadState();
        if (!state || !state.active) {
            return;
        }
        renderCurrentStep();
    }

    function autoStartIfNeeded() {
        if (!window._autoStartTutorial) {
            return;
        }
        window._autoStartTutorial = false;
        if (loadState() && loadState().active) {
            resumeTutorialIfNeeded();
            return;
        }
        window.setTimeout(startTutorial, 280);
    }

    function init() {
        ensureOverlay();
        window.startTutorial = startTutorial;
        window.skipTutorial = skipTutorial;
        window._tutorialActive = !!(loadState() && loadState().active);
        const triggerLink = document.querySelector('a[onclick*="startTutorial"]');
        if (triggerLink) {
            triggerLink.addEventListener('click', function (event) {
                event.preventDefault();
                startTutorial();
            });
        }
        window.addEventListener('resize', function () {
            if (window._tutorialActive) {
                renderCurrentStep();
            }
        });
        document.addEventListener('scroll', function () {
            if (window._tutorialActive) {
                renderCurrentStep();
            }
        }, true);
        document.addEventListener('keydown', handleTutorialHotkeys, true);
        document.addEventListener('keydown', handleGlobalNavigationHotkeys, true);
        resumeTutorialIfNeeded();
        autoStartIfNeeded();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
