(function () {
    'use strict';

    const state = {
        active: false,
        pageKey: '',
        pageTitle: '',
        steps: [],
        index: 0,
        cleanup: null,
        currentTarget: null,
    };

    let overlay = null;
    let spotlight = null;
    let panel = null;
    let progressNode = null;
    let titleNode = null;
    let bodyNode = null;
    let hintNode = null;

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
                pointer-events: auto;
                display: none;
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
        overlay.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
        });

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

    function getSpeechRate() {
        if (typeof window.getSpeechDisplayRate === 'function') {
            return window.getSpeechDisplayRate();
        }
        return typeof window._rate === 'number' ? window._rate : 1;
    }

    function speak(text) {
        if (!text) {
            return;
        }

        if (typeof window.speakWithGlobalConfig === 'function') {
            window.speakWithGlobalConfig(text, { force: true });
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
            utterance.rate = getSpeechRate();
        }
        window.speechSynthesis.speak(utterance);
    }

    function stopSpeech() {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }

    function isEditableTarget(target) {
        if (!target) {
            return false;
        }
        const tagName = (target.tagName || '').toUpperCase();
        return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || !!target.isContentEditable;
    }

    function normalizeKey(event) {
        if (!event || typeof event.key !== 'string') {
            return '';
        }
        if (event.key === ' ') {
            return 'space';
        }
        return event.key.toLowerCase();
    }

    function getPageKey() {
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

    function getPageTitle(pageKey) {
        const titles = {
            index: '上传文档',
            'my-notes': '我的笔记',
            'mistake-notebook': '错题本',
            community: '学习社区',
        };
        return titles[pageKey] || '当前页面';
    }

    function removeDemoSelection() {
        const badge = document.getElementById('tutorial-demo-selection');
        if (badge) {
            badge.remove();
        }
    }

    function showDemoSelection() {
        const fileInput = document.getElementById('file');
        if (!fileInput || document.getElementById('tutorial-demo-selection')) {
            return;
        }
        const badge = document.createElement('div');
        badge.id = 'tutorial-demo-selection';
        badge.className = 'tutorial-demo-selection';
        badge.textContent = '教程示例：这里以“示例文档.docx”演示上传流程。';
        fileInput.insertAdjacentElement('afterend', badge);
    }

    function getCommunityPostNode() {
        return (
            document.querySelector('#community-post-list .community-post.is-selected') ||
            document.querySelector('#community-post-list .community-post') ||
            document.getElementById('community-post-list')
        );
    }

    function getCommunityActionNode() {
        return (
            document.querySelector('#community-post-list .community-post.is-selected .community-post-actions') ||
            document.querySelector('#community-post-list .community-post .community-post-actions') ||
            getCommunityPostNode()
        );
    }

    function getNotesCollectionNode() {
        return (
            document.querySelector('.note-row') ||
            document.querySelector('.folder-card') ||
            document.querySelector('.empty-browser') ||
            document.getElementById('folder-name')
        );
    }

    function getMistakeDocumentNode() {
        return document.getElementById('mistake-document-view') || document.getElementById('mistake-shortcut-text');
    }

    function getMistakeQuestionNode() {
        return document.getElementById('mistake-question-view') || document.getElementById('mistake-document-view');
    }

    function ensureMistakeQuestionView() {
        if (typeof window.openCurrentDocument === 'function') {
            window.openCurrentDocument(false);
        }
    }

    function cleanupMistakeView() {
        if (typeof window.backToDocuments === 'function') {
            window.backToDocuments(false);
        }
    }

    function buildTutorialConfig(pageKey) {
        if (pageKey === 'index') {
            return {
                title: '上传文档',
                cleanup: removeDemoSelection,
                steps: [
                    {
                        title: '选择文档',
                        description: '这里是上传入口。你真实使用时就在这里选择 PDF、Word、PPT 或图片。\n教程用示例文档说明流程，不会真的替你提交。',
                        target: '#file',
                        onShow: showDemoSelection,
                    },
                    {
                        title: '补充处理要求',
                        description: '如果你想指定总结方式，可以在这里输入要求；留空时系统会自动做文档总结和后续例题。',
                        target: '#prompt',
                    },
                    {
                        title: '开始处理',
                        description: '确认文档和要求后，点击这里开始处理。之后会进入处理中页面，等待总结和例题生成完成。',
                        target: '#submitBtn',
                    },
                    {
                        title: '上传页快捷键',
                        description: '上传页常用操作是：U 选择文档，Enter 开始处理，R 重置，长按 V 录入处理要求。',
                        target: '#uploadForm',
                    },
                ],
            };
        }

        if (pageKey === 'my-notes') {
            return {
                title: '我的笔记',
                steps: [
                    {
                        title: '文件夹树',
                        description: '左侧是你的笔记树。可以先选中文件夹，再查看这个文件夹下的笔记和子文件夹。',
                        target: '#notes-tree',
                    },
                    {
                        title: '新建文件夹',
                        description: '这里可以新建文件夹，用来按课程、章节或年级整理你的学习笔记。',
                        target: '#open-create-folder',
                    },
                    {
                        title: '当前路径',
                        description: '这里会显示你当前所在的文件夹和路径，便于判断自己正在查看哪一组笔记。',
                        target: '#folder-name',
                    },
                    {
                        title: '笔记内容区',
                        description: '右侧会展示当前路径下的笔记和子文件夹。进入详情后，你可以继续阅读、做题或回看总结。',
                        target: getNotesCollectionNode,
                    },
                ],
            };
        }

        if (pageKey === 'mistake-notebook') {
            const hasMistakes = !!document.getElementById('mistake-shortcut-text');
            if (!hasMistakes) {
                return {
                    title: '错题本',
                    steps: [
                        {
                            title: '错题本入口',
                            description: '这里会按原始上传文档整理你做错的题。等你先完成几次练习后，新的错题会自动收进这里。',
                            target: '.card',
                        },
                    ],
                };
            }

            return {
                title: '错题本',
                cleanup: cleanupMistakeView,
                steps: [
                    {
                        title: '错题本快捷键',
                        description: '进入错题本后，先左右切换文档，再按回车打开某个文档下的错题。这里会先播报这一页支持的快捷键。',
                        target: '#mistake-shortcut-text',
                    },
                    {
                        title: '按文档分组',
                        description: '这里展示当前选中的上传文档。左右键可以切换文档，回车会进入这个文档对应的错题列表。',
                        target: getMistakeDocumentNode,
                    },
                    {
                        title: '查看某一道错题',
                        description: '打开文档后，这里会展示某一道错题的题目、选项、正确答案和解析。左右键可以切换同一文档里的其他错题。',
                        target: getMistakeQuestionNode,
                        onShow: ensureMistakeQuestionView,
                    },
                    {
                        title: '重做当前文档错题',
                        description: '这里可以直接重做当前文档的整组错题；如果你只是想回到文档列表，可以使用下面的返回按钮。',
                        target: '#mistake-redo-link',
                        onShow: ensureMistakeQuestionView,
                    },
                ],
            };
        }

        if (pageKey === 'community') {
            return {
                title: '学习社区',
                steps: [
                    {
                        title: '搜索帖子',
                        description: '这里可以按标题、内容或发布者搜索社区帖子。学习社区快捷键里，斜杠 / 会直接聚焦到这个搜索框。',
                        target: '#community-search-input',
                    },
                    {
                        title: '浏览帖子',
                        description: '这里是帖子列表。你可以用上下键切换帖子，用 Enter 展开或收起，用 L 朗读当前帖子。',
                        target: getCommunityPostNode,
                    },
                    {
                        title: '保存和删除',
                        description: '帖子展开后，可以把内容保存到“我的笔记”；如果是你自己发布的帖子，也可以直接删除。',
                        target: getCommunityActionNode,
                    },
                ],
            };
        }

        return null;
    }

    function resolveTarget(target) {
        if (!target) {
            return null;
        }
        if (typeof target === 'function') {
            return resolveTarget(target());
        }
        if (typeof target === 'string') {
            return document.querySelector(target);
        }
        return target;
    }

    function positionOverlay(target) {
        if (!target) {
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
        const panelHeight = panel.offsetHeight || 220;
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
        if (panelTop + panelHeight > window.innerHeight - 16) {
            panelTop = Math.max(16, window.innerHeight - panelHeight - 16);
        }
        if (panelTop < 16) {
            panelTop = 16;
        }

        panel.style.left = `${panelLeft}px`;
        panel.style.top = `${panelTop}px`;
    }

    function renderCurrentStep(shouldSpeak) {
        if (!state.active) {
            return;
        }

        const step = state.steps[state.index];
        if (!step) {
            finishTutorial('complete');
            return;
        }

        if (typeof step.onShow === 'function') {
            step.onShow();
        }

        const target = resolveTarget(step.target) || document.querySelector('main') || document.body;
        state.currentTarget = target;

        overlay.classList.add('is-active');
        document.body.classList.add('tutorial-overlay-open');

        if (typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        }

        progressNode.textContent = `${state.pageTitle}教程 ${state.index + 1} / ${state.steps.length}`;
        titleNode.textContent = step.title;
        bodyNode.textContent = step.description;
        hintNode.textContent = '按 Enter 继续，按 Esc 退出教程。';

        window.requestAnimationFrame(function () {
            positionOverlay(target);
            panel.focus({ preventScroll: true });
        });

        if (shouldSpeak) {
            speak(`${state.pageTitle}教程。${step.title}。${step.description}。按回车继续，按 Esc 退出。`);
        }
    }

    function resetTutorialState() {
        state.active = false;
        state.pageKey = '';
        state.pageTitle = '';
        state.steps = [];
        state.index = 0;
        state.cleanup = null;
        state.currentTarget = null;
        window._tutorialActive = false;
        window._tutorialManagedByNewEngine = false;
    }

    function finishTutorial(reason) {
        if (typeof state.cleanup === 'function') {
            state.cleanup();
        }

        removeDemoSelection();
        stopSpeech();

        if (overlay) {
            overlay.classList.remove('is-active');
        }
        document.body.classList.remove('tutorial-overlay-open');

        const completed = reason === 'complete';
        resetTutorialState();

        if (completed) {
            speak('当前页面的新手教程已经完成。');
        } else if (reason === 'cancelled') {
            speak('已退出当前页面的新手教程。');
        }
    }

    function startTutorial() {
        const pageKey = getPageKey();
        const config = buildTutorialConfig(pageKey);

        if (!config || !Array.isArray(config.steps) || !config.steps.length) {
            speak('当前页面暂时还没有可用的新手教程。');
            return;
        }

        if (window._aiWindowOpen && typeof window.closeAIAssistant === 'function') {
            window.closeAIAssistant();
        }

        ensureOverlay();
        removeDemoSelection();
        stopSpeech();

        state.active = true;
        state.pageKey = pageKey;
        state.pageTitle = config.title || getPageTitle(pageKey);
        state.steps = config.steps;
        state.index = 0;
        state.cleanup = typeof config.cleanup === 'function' ? config.cleanup : null;
        state.currentTarget = null;

        window._tutorialActive = true;
        window._tutorialManagedByNewEngine = true;

        renderCurrentStep(true);
    }

    function advanceTutorial() {
        if (!state.active) {
            return;
        }

        state.index += 1;
        if (state.index >= state.steps.length) {
            finishTutorial('complete');
            return;
        }

        renderCurrentStep(true);
    }

    function handleKeydown(event) {
        const key = normalizeKey(event);

        if (state.active) {
            if (key === 'escape') {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                finishTutorial('cancelled');
                return;
            }

            if (key === 'enter') {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                advanceTutorial();
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
        }

        if (key !== 'f' || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        startTutorial();
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

    function handleViewportChange() {
        if (!state.active || !state.currentTarget) {
            return;
        }
        positionOverlay(state.currentTarget);
    }

    function autoStartIfNeeded() {
        if (!window._autoStartTutorial) {
            return;
        }
        window._autoStartTutorial = false;
        window.setTimeout(startTutorial, 320);
    }

    function init() {
        window.startTutorial = startTutorial;
        window.skipTutorial = function () {
            finishTutorial('cancelled');
        };
        window._tutorialManagedByNewEngine = false;

        ensureOverlay();
        bindTrigger();
        document.addEventListener('keydown', handleKeydown, true);
        window.addEventListener('resize', handleViewportChange);
        document.addEventListener('scroll', handleViewportChange, true);
        autoStartIfNeeded();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
