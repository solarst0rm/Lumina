(function () {
    'use strict';

    const COMMUNITY_VERSION = 1;
    const DEFAULT_STATE = {
        version: COMMUNITY_VERSION,
        updatedAt: '',
        posts: [],
    };

    const SEED_POSTS = [
        {
            id: 'seed-1',
            title: '如何高效整理课程总结',
            content: '上传文档后，可以把总结和练习题一起发布到学习社区，方便后续复习和交流。建议标题尽量简洁，内容按知识点分段，阅读体验会更好。',
            createdAt: '2026-03-01T10:00:00.000Z',
            updatedAt: '2026-03-01T10:00:00.000Z',
            source: 'seed',
            author: '学习社区助手',
        },
        {
            id: 'seed-2',
            title: '盲生模式下的键盘操作小技巧',
            content: '如果你主要依赖键盘操作，可以先熟悉页面进入后的快捷键播报，再配合语速调节使用。这样在不同板块之间切换时会更顺手。',
            createdAt: '2026-03-02T12:00:00.000Z',
            updatedAt: '2026-03-02T12:00:00.000Z',
            source: 'seed',
            author: '学习社区助手',
        },
        {
            id: 'seed-3',
            title: '上传学习包前可以做什么',
            content: '建议先完成练习题，再把总结和练习题一起上传到学习社区。这样帖子内容更完整，也方便其他同学直接参考。',
            createdAt: '2026-03-03T09:30:00.000Z',
            updatedAt: '2026-03-03T09:30:00.000Z',
            source: 'seed',
            author: '学习社区助手',
        },
    ];

    const MODERATION_KEYWORDS = [
        '身份证',
        '银行卡',
        '手机号',
        '住址',
        '密码',
        '验证码',
        'shellcode',
        'payload',
    ];

    const MODERATION_PATTERNS = [
        { name: '邮箱地址', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
        { name: '手机号', re: /\b1[3-9]\d{9}\b/g },
    ];

    function nowIso() {
        return new Date().toISOString();
    }

    function getUsername() {
        const name = typeof window._currentUsername === 'string' ? window._currentUsername : '';
        return name && name.trim() ? name.trim() : 'local';
    }

    function getStorageKey() {
        return `hakki-local-community-v${COMMUNITY_VERSION}:${getUsername()}`;
    }

    function getFileHandleKey() {
        return `fileHandle:${getStorageKey()}`;
    }

    function safeJsonParse(text) {
        if (!text) {
            return null;
        }
        try {
            return JSON.parse(text);
        } catch (error) {
            return null;
        }
    }

    function normalizePost(post) {
        if (!post || typeof post !== 'object') {
            return null;
        }
        const normalized = {
            id: String(post.id || '').trim(),
            title: String(post.title || '').trim(),
            content: String(post.content || ''),
            createdAt: String(post.createdAt || ''),
            updatedAt: String(post.updatedAt || ''),
            source: String(post.source || 'local'),
            author: String(post.author || getUsername()).trim() || getUsername(),
        };
        if (!normalized.id || !normalized.title) {
            return null;
        }
        return normalized;
    }

    function normalizeState(state) {
        if (!state || typeof state !== 'object') {
            return { ...DEFAULT_STATE };
        }
        const posts = Array.isArray(state.posts) ? state.posts : [];
        return {
            version: COMMUNITY_VERSION,
            updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : '',
            posts: posts.map(normalizePost).filter(Boolean),
        };
    }

    function loadFromLocalStorage() {
        if (!window.localStorage) {
            return { ...DEFAULT_STATE };
        }
        const raw = window.localStorage.getItem(getStorageKey());
        return normalizeState(safeJsonParse(raw) || DEFAULT_STATE);
    }

    function saveToLocalStorage(state) {
        if (!window.localStorage) {
            return;
        }
        window.localStorage.setItem(getStorageKey(), JSON.stringify(state));
    }

    async function openIdb() {
        if (!('indexedDB' in window)) {
            return null;
        }
        return await new Promise(function (resolve) {
            const request = window.indexedDB.open('hakki-local-community', 1);
            request.onupgradeneeded = function () {
                const db = request.result;
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config');
                }
            };
            request.onsuccess = function () {
                resolve(request.result);
            };
            request.onerror = function () {
                resolve(null);
            };
        });
    }

    async function idbGet(key) {
        const db = await openIdb();
        if (!db) {
            return null;
        }
        return await new Promise(function (resolve) {
            const tx = db.transaction('config', 'readonly');
            const store = tx.objectStore('config');
            const request = store.get(key);
            request.onsuccess = function () {
                resolve(request.result || null);
            };
            request.onerror = function () {
                resolve(null);
            };
        });
    }

    async function idbSet(key, value) {
        const db = await openIdb();
        if (!db) {
            return false;
        }
        return await new Promise(function (resolve) {
            const tx = db.transaction('config', 'readwrite');
            const store = tx.objectStore('config');
            const request = store.put(value, key);
            request.onsuccess = function () {
                resolve(true);
            };
            request.onerror = function () {
                resolve(false);
            };
        });
    }

    function isFilePersistenceSupported() {
        return (
            typeof window.showSaveFilePicker === 'function' &&
            typeof FileSystemFileHandle !== 'undefined'
        );
    }

    async function getFileHandle() {
        return await idbGet(getFileHandleKey());
    }

    async function setFileHandle(handle) {
        return await idbSet(getFileHandleKey(), handle);
    }

    async function readStateFromFile(handle) {
        try {
            const file = await handle.getFile();
            const text = await file.text();
            return normalizeState(safeJsonParse(text) || DEFAULT_STATE);
        } catch (error) {
            return null;
        }
    }

    async function writeStateToFile(handle, state) {
        try {
            const writable = await handle.createWritable();
            await writable.write(JSON.stringify(state, null, 2));
            await writable.close();
            return true;
        } catch (error) {
            return false;
        }
    }

    function ensureSeeded(state) {
        if (state.posts && state.posts.length) {
            return state;
        }
        return normalizeState({
            version: COMMUNITY_VERSION,
            updatedAt: nowIso(),
            posts: SEED_POSTS,
        });
    }

    async function loadState() {
        let state = loadFromLocalStorage();

        if (isFilePersistenceSupported()) {
            const handle = await getFileHandle();
            if (handle) {
                const fileState = await readStateFromFile(handle);
                if (fileState) {
                    state = fileState;
                    saveToLocalStorage(state);
                }
            }
        }

        state = ensureSeeded(state);
        saveToLocalStorage(state);
        return state;
    }

    async function saveState(state) {
        const normalized = normalizeState(state);
        normalized.updatedAt = nowIso();
        saveToLocalStorage(normalized);
        if (isFilePersistenceSupported()) {
            const handle = await getFileHandle();
            if (handle) {
                await writeStateToFile(handle, normalized);
            }
        }
        return normalized;
    }

    function moderateContent(text) {
        const content = (text || '').toString();
        if (!content.trim()) {
            return { ok: false, reason: '帖子内容不能为空。' };
        }

        if (content.length > 50000) {
            return { ok: false, reason: '帖子内容过长，请控制在 50000 字以内。' };
        }

        const lowered = content.toLowerCase();
        for (let i = 0; i < MODERATION_KEYWORDS.length; i += 1) {
            const keyword = MODERATION_KEYWORDS[i];
            if (keyword && lowered.includes(keyword.toLowerCase())) {
                return { ok: false, reason: `帖子内容包含敏感信息：${keyword}` };
            }
        }

        for (let i = 0; i < MODERATION_PATTERNS.length; i += 1) {
            const rule = MODERATION_PATTERNS[i];
            rule.re.lastIndex = 0;
            if (rule.re.test(content)) {
                return { ok: false, reason: `帖子内容包含敏感信息：${rule.name}` };
            }
        }

        return { ok: true, reason: '' };
    }

    function extractTitleFromMarkdown(markdownText) {
        const text = (markdownText || '').toString();
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
            const trimmed = lines[i].trim();
            if (!trimmed) {
                continue;
            }
            const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
            if (headingMatch) {
                return headingMatch[1].trim();
            }
            return trimmed.replace(/\s+/g, ' ');
        }
        return '学习社区帖子';
    }

    function clip(text, maxLen) {
        const value = (text || '').toString().trim();
        if (value.length <= maxLen) {
            return value;
        }
        return value.slice(0, Math.max(0, maxLen - 1)) + '…';
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function makeId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    async function addPostFromSummary(summaryText) {
        const moderation = moderateContent(summaryText);
        if (!moderation.ok) {
            return { success: false, error: moderation.reason };
        }

        const post = {
            id: makeId(),
            title: clip(extractTitleFromMarkdown(summaryText), 48) || '学习社区帖子',
            content: summaryText.toString(),
            createdAt: nowIso(),
            updatedAt: nowIso(),
            source: 'ai-summary',
            author: getUsername(),
        };

        const state = await loadState();
        state.posts = [post].concat(Array.isArray(state.posts) ? state.posts : []);
        await saveState(state);
        return { success: true, post: post };
    }

    function searchPosts(state, keyword) {
        const query = (keyword || '').toString().trim().toLowerCase();
        const posts = Array.isArray(state.posts) ? state.posts : [];
        if (!query) {
            return posts;
        }
        return posts.filter(function (post) {
            const title = (post.title || '').toLowerCase();
            const content = (post.content || '').toLowerCase();
            const author = (post.author || '').toLowerCase();
            return title.includes(query) || content.includes(query) || author.includes(query);
        });
    }

    function formatDate(iso) {
        if (!iso) {
            return '';
        }
        const value = new Date(iso);
        if (Number.isNaN(value.getTime())) {
            return iso;
        }
        return value.toLocaleString();
    }

    function sourceLabel(source) {
        const value = (source || '').toString();
        if (value === 'ai-summary') {
            return 'AI总结';
        }
        if (value === 'study-pack') {
            return '学习包';
        }
        if (value === 'seed') {
            return '社区示例';
        }
        return '学习社区';
    }

    function escapeHtml(text) {
        return (text || '')
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function stripMarkdown(text) {
        return (text || '')
            .toString()
            .replace(/\r\n?/g, '\n')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^[-*+]\s+/gm, '')
            .replace(/^\d+\.\s+/gm, '')
            .replace(/^>\s?/gm, '')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/\*([^*\n]+)\*/g, '$1')
            .replace(/_([^_\n]+)_/g, '$1')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function renderInlineMarkdown(text) {
        let html = escapeHtml((text || '').toString());
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
        html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
        html = html.replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            function (_, label, url) {
                return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
            }
        );
        return html;
    }

    function renderMarkdownHtml(markdownText) {
        const normalized = (markdownText || '').toString().replace(/\r\n?/g, '\n').trim();
        if (!normalized) {
            return '<p>暂无内容</p>';
        }

        const lines = normalized.split('\n');
        const html = [];
        let listType = '';

        function closeList() {
            if (listType) {
                html.push('</' + listType + '>');
                listType = '';
            }
        }

        for (let i = 0; i < lines.length; i += 1) {
            const rawLine = lines[i] || '';
            const line = rawLine.replace(/\t/g, '    ');
            const trimmed = line.trim();

            if (!trimmed) {
                closeList();
                continue;
            }

            if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
                closeList();
                html.push('<hr>');
                continue;
            }

            const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (heading) {
                closeList();
                const level = Math.min(heading[1].length, 6);
                html.push('<h' + level + '>' + renderInlineMarkdown(heading[2]) + '</h' + level + '>');
                continue;
            }

            const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
            if (bullet) {
                if (listType !== 'ul') {
                    closeList();
                    html.push('<ul>');
                    listType = 'ul';
                }
                html.push('<li>' + renderInlineMarkdown(bullet[1]) + '</li>');
                continue;
            }

            const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
            if (numbered) {
                if (listType !== 'ol') {
                    closeList();
                    html.push('<ol>');
                    listType = 'ol';
                }
                html.push('<li>' + renderInlineMarkdown(numbered[1]) + '</li>');
                continue;
            }

            const quote = trimmed.match(/^>\s?(.*)$/);
            if (quote) {
                closeList();
                html.push('<blockquote>' + renderInlineMarkdown(quote[1]) + '</blockquote>');
                continue;
            }

            closeList();
            html.push('<p>' + renderInlineMarkdown(trimmed) + '</p>');
        }

        closeList();
        return html.join('');
    }

    function getSnippetText(post) {
        return clip(stripMarkdown(post && post.content), 180);
    }

    function canDeletePost(post) {
        return !!(post && post.source !== 'seed');
    }

    async function savePostToNotes(post, button) {
        if (!post) {
            return;
        }

        if (button) {
            button.disabled = true;
        }

        try {
            const response = await fetch('/api/community/save-note', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    title: post.title || '',
                    content: post.content || '',
                    source_filename: post.title || '',
                }),
            });

            const payload = await response.json().catch(function () {
                return {};
            });

            if (!response.ok || !payload.success) {
                throw new Error(payload.error || '保存失败，请稍后重试。');
            }

            if (button) {
                button.dataset.saved = '1';
                button.innerHTML = '<i class="fas fa-check"></i> 已保存到我的笔记';
            }

            speakFeedback(payload.message || '已保存到我的笔记。');
        } catch (error) {
            if (button) {
                button.disabled = false;
            }
            speakFeedback(error && error.message ? error.message : '保存到我的笔记失败。');
        }
    }

    function renderPostItem(post, highlightId) {
        const contentId = `post-content-${post.id}`;
        const isHighlight = highlightId && highlightId === post.id;
        const borderStyle = isHighlight ? 'border-left: 4px solid var(--success-color);' : '';
        const saveButton = `
                <button type="button" class="btn btn-success" data-save-post-id="${escapeHtml(post.id)}">
                    <i class="fas fa-bookmark"></i> 保存到我的笔记
                </button>
            `;
        const deleteButton = canDeletePost(post)
            ? `
                <button type="button" class="btn btn-danger" data-delete-post-id="${escapeHtml(post.id)}">
                    <i class="fas fa-trash"></i> 删除
                </button>
            `
            : '';

        return `
            <div class="card community-post" id="post-${escapeHtml(post.id)}" style="${borderStyle}">
                <div class="community-post-title">
                    <h3><i class="fas fa-comment-dots"></i> ${escapeHtml(post.title)}</h3>
                    <span class="community-meta">发布者：${escapeHtml(post.author)}</span>
                    <span class="community-meta">时间：${escapeHtml(formatDate(post.createdAt))}</span>
                </div>
                <div class="community-post-snippet" id="${contentId}" data-full="0">${escapeHtml(getSnippetText(post))}</div>
                <div class="community-post-actions">
                    <button type="button" class="btn btn-secondary" data-toggle-post-id="${escapeHtml(post.id)}">
                        <i class="fas fa-eye"></i> 查看全文
                    </button>
                    ${saveButton}
                    ${deleteButton}
                    <span class="community-meta">来源：${escapeHtml(sourceLabel(post.source))}</span>
                </div>
            </div>
        `;
    }

    function speakFeedback(text) {
        if (!text) {
            return;
        }
        if (typeof window.speakWithGlobalConfig === 'function') {
            window.speakWithGlobalConfig(text, {
                force: true,
                interrupt: true,
                track: false,
            });
            return;
        }
        if (!window.speechSynthesis) {
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = typeof window._rate === 'number' ? window._rate : 1;
        window.speechSynthesis.speak(utterance);
    }

    function getHighlightId() {
        try {
            const url = new URL(window.location.href);
            return url.searchParams.get('highlight') || '';
        } catch (error) {
            return '';
        }
    }

    async function initCommunityPage() {
        const root = document.getElementById('community-page-root');
        const listNode = document.getElementById('community-post-list');
        const searchInput = document.getElementById('community-search-input');
        if (!root || !listNode || !searchInput) {
            return;
        }

        const highlightId = getHighlightId();
        const hintNode = document.getElementById('community-storage-hint');
        const fileToggle = document.getElementById('community-file-toggle');
        let currentPostsById = new Map();
        let currentPostIds = [];
        let selectedPostId = '';
        let keyboardAnnouncementPlayed = false;
        let currentSpeechPostId = '';
        let currentSpeechText = '';

        if (fileToggle && isFilePersistenceSupported()) {
            fileToggle.style.display = '';
        }

        function isBlockedHotkeyTarget(target) {
            return !!(target && (
                ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') && target !== searchInput) ||
                (target.isContentEditable && target !== searchInput)
            ));
        }

        function getCurrentPost() {
            if (selectedPostId && currentPostsById.has(selectedPostId)) {
                return currentPostsById.get(selectedPostId);
            }
            if (currentPostIds.length) {
                return currentPostsById.get(currentPostIds[0]) || null;
            }
            return null;
        }

        function isPostExpanded(postId) {
            const node = document.getElementById(`post-content-${postId}`);
            return !!(node && node.getAttribute('data-full') === '1');
        }

        function buildPostSpeech(post) {
            if (!post) {
                return '当前没有可朗读的帖子。';
            }
            const isExpanded = isPostExpanded(post.id);
            const body = isExpanded ? stripMarkdown(post.content || '') : getSnippetText(post);
            return [
                `当前帖子《${post.title}》`,
                post.author ? `发布者 ${post.author}` : '',
                body || '暂无内容',
                isExpanded ? '已展开全文。' : '按回车可展开全文。'
            ].filter(Boolean).join('。');
        }

        function startPostSpeech(post) {
            if (!post) {
                speakFeedback('当前没有可朗读的帖子。');
                return;
            }

            const text = buildPostSpeech(post);
            if (!text) {
                speakFeedback('当前帖子没有可朗读的内容。');
                return;
            }

            currentSpeechPostId = post.id;
            currentSpeechText = text;

            if (typeof window.speakWithGlobalConfig === 'function') {
                window.speakWithGlobalConfig(text, {
                    force: true,
                    interrupt: true,
                    track: true,
                    delayMs: 30,
                });
                return;
            }

            if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
                return;
            }

            try {
                window.speechSynthesis.cancel();
            } catch (error) {
                // Ignore cancel failures.
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'zh-CN';
            utterance.rate = typeof window._rate === 'number' ? window._rate : 1;
            window.speechSynthesis.speak(utterance);
        }

        function togglePostSpeechPause() {
            if (!window.speechSynthesis) {
                return;
            }

            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
                return;
            }

            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.pause();
                return;
            }

            const post = (currentSpeechPostId && currentPostsById.get(currentSpeechPostId)) || getCurrentPost();
            if (post && currentSpeechText) {
                startPostSpeech(post);
                return;
            }

            speakFeedback('当前没有正在朗读的帖子。');
        }

        function scrollSelectedPostIntoView() {
            if (!selectedPostId) {
                return;
            }
            const node = document.getElementById(`post-${selectedPostId}`);
            if (node && typeof node.scrollIntoView === 'function') {
                node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        function updateSelectedPostUI() {
            const nodes = listNode.querySelectorAll('.community-post');
            nodes.forEach(function (node) {
                node.classList.toggle('is-selected', node.id === `post-${selectedPostId}`);
            });
        }

        function setSelectedPost(postId, options) {
            const config = options || {};
            if (!postId || !currentPostsById.has(postId)) {
                return;
            }
            selectedPostId = postId;
            updateSelectedPostUI();
            if (config.scroll !== false) {
                scrollSelectedPostIntoView();
            }
            if (config.announce) {
                const post = currentPostsById.get(postId);
                speakFeedback(buildPostSpeech(post));
            }
        }

        function moveSelection(delta) {
            if (!currentPostIds.length) {
                speakFeedback('当前没有帖子。');
                return;
            }
            const currentIndex = Math.max(0, currentPostIds.indexOf(selectedPostId));
            const nextIndex = clamp(currentIndex + delta, 0, currentPostIds.length - 1);
            if (nextIndex === currentIndex) {
                speakFeedback(delta > 0 ? '已经是最后一篇帖子。' : '已经是第一篇帖子。');
                return;
            }
            setSelectedPost(currentPostIds[nextIndex], { announce: true });
        }

        function toggleSelectedPost(options) {
            const config = options || {};
            const post = getCurrentPost();
            if (!post) {
                speakFeedback('当前没有可展开的帖子。');
                return;
            }
            const toggleButton = listNode.querySelector(`button[data-toggle-post-id="${post.id}"]`);
            if (!toggleButton) {
                return;
            }
            toggleButton.click();
            setSelectedPost(post.id, {
                announce: false,
                scroll: false,
            });
            if (config.announce === true) {
                speakFeedback(buildPostSpeech(post));
            }
        }

        function focusSearchInput() {
            searchInput.focus();
            if (typeof searchInput.select === 'function') {
                searchInput.select();
            }
        }

        async function saveSelectedPost() {
            const post = getCurrentPost();
            if (!post) {
                speakFeedback('当前没有可保存的帖子。');
                return;
            }
            const button = listNode.querySelector(`button[data-save-post-id="${post.id}"]`);
            await savePostToNotes(post, button);
        }

        async function deleteSelectedPost() {
            const post = getCurrentPost();
            if (!post) {
                speakFeedback('当前没有可删除的帖子。');
                return;
            }
            if (!canDeletePost(post)) {
                speakFeedback('只能删除自己发布的帖子。');
                return;
            }
            if (!window.confirm(`确认删除《${post.title}》吗？`)) {
                return;
            }

            const state = await loadState();
            state.posts = (state.posts || []).filter(function (item) {
                return item.id !== post.id;
            });
            await saveState(state);
            const removedIndex = Math.max(0, currentPostIds.indexOf(post.id));
            await refresh();
            if (currentPostIds.length) {
                const nextIndex = clamp(removedIndex, 0, currentPostIds.length - 1);
                setSelectedPost(currentPostIds[nextIndex], { announce: false });
            }
            speakFeedback('帖子已删除。');
        }

        function announcePageShortcuts() {
            if (keyboardAnnouncementPlayed) {
                return;
            }
            keyboardAnnouncementPlayed = true;
            speakFeedback('当前是学习社区页面。按斜杠聚焦搜索。按上下方向键切换帖子。按回车展开或收起当前帖子。按 L 朗读当前帖子。按 U 保存当前帖子到我的笔记。按 Delete 删除当前帖子。按 Esc 返回搜索框。');
        }

        function setHint(text) {
            if (!hintNode) {
                return;
            }
            hintNode.textContent = text || '';
        }

        async function updateHint() {
            if (!isFilePersistenceSupported()) {
                setHint('当前使用浏览器本地存储。');
                return;
            }
            const handle = await getFileHandle();
            setHint(handle ? '当前已连接本地 JSON 文件同步。' : '当前使用浏览器本地存储。');
        }

        async function refresh() {
            const state = await loadState();
            const posts = searchPosts(state, searchInput.value || '');
            currentPostsById = new Map();
            posts.forEach(function (post) {
                currentPostsById.set(post.id, post);
            });
            currentPostIds = posts.map(function (post) {
                return post.id;
            });

            if (!posts.length) {
                listNode.innerHTML = '<div class="card community-empty">暂无匹配的帖子</div>';
                selectedPostId = '';
                return;
            }

            listNode.innerHTML = posts.map(function (post) {
                return renderPostItem(post, highlightId);
            }).join('');

            if (highlightId && currentPostsById.has(highlightId)) {
                selectedPostId = highlightId;
            } else if (!selectedPostId || !currentPostsById.has(selectedPostId)) {
                selectedPostId = currentPostIds[0];
            }

            updateSelectedPostUI();

            if (highlightId) {
                const highlightNode = document.getElementById(`post-${highlightId}`);
                if (highlightNode && typeof highlightNode.scrollIntoView === 'function') {
                    highlightNode.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }
            } else {
                scrollSelectedPostIntoView();
            }
        }

        listNode.addEventListener('click', async function (event) {
            const postCard = event.target && event.target.closest
                ? event.target.closest('.community-post')
                : null;
            if (postCard) {
                const postIdFromCard = postCard.id.replace(/^post-/, '');
                if (postIdFromCard) {
                    setSelectedPost(postIdFromCard, { scroll: false });
                }
            }

            const toggleButton = event.target && event.target.closest
                ? event.target.closest('button[data-toggle-post-id]')
                : null;
            if (toggleButton) {
                const postId = toggleButton.getAttribute('data-toggle-post-id');
                const post = currentPostsById.get(postId);
                const contentNode = document.getElementById(`post-content-${postId}`);
                if (!post || !contentNode) {
                    return;
                }

                const isFull = contentNode.getAttribute('data-full') === '1';
                if (isFull) {
                    contentNode.innerHTML = escapeHtml(getSnippetText(post));
                    contentNode.setAttribute('data-full', '0');
                    contentNode.classList.remove('is-rendered');
                    toggleButton.innerHTML = '<i class="fas fa-eye"></i> 查看全文';
                } else {
                    contentNode.innerHTML = renderMarkdownHtml(post.content || '');
                    contentNode.setAttribute('data-full', '1');
                    contentNode.classList.add('is-rendered');
                    toggleButton.innerHTML = '<i class="fas fa-eye-slash"></i> 收起内容';
                }
                return;
            }

            const saveButton = event.target && event.target.closest
                ? event.target.closest('button[data-save-post-id]')
                : null;
            if (saveButton) {
                const postId = saveButton.getAttribute('data-save-post-id');
                const post = currentPostsById.get(postId);
                await savePostToNotes(post, saveButton);
                return;
            }

            const deleteButton = event.target && event.target.closest
                ? event.target.closest('button[data-delete-post-id]')
                : null;
            if (!deleteButton) {
                return;
            }

            await deleteSelectedPost();
        });

        searchInput.addEventListener('input', function () {
            refresh();
        });

        searchInput.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                focusSearchInput();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (!root || !document.body.contains(root)) {
                return;
            }
            if (window._tutorialActive || window._helpOverlayOpen || window._aiWindowOpen) {
                return;
            }
            if (event.altKey || event.ctrlKey || event.metaKey) {
                return;
            }
            if (isBlockedHotkeyTarget(event.target)) {
                return;
            }

            const key = String(event.key || '').toLowerCase();

            if (key === '/') {
                event.preventDefault();
                focusSearchInput();
                return;
            }

            if (key === 'escape') {
                event.preventDefault();
                focusSearchInput();
                return;
            }

            if (key === 'arrowup') {
                event.preventDefault();
                moveSelection(-1);
                return;
            }

            if (key === 'arrowdown') {
                event.preventDefault();
                moveSelection(1);
                return;
            }

            if (key === 'enter') {
                event.preventDefault();
                toggleSelectedPost({ announce: true });
                return;
            }

            if (key === 'l') {
                event.preventDefault();
                startPostSpeech(getCurrentPost());
                return;
            }

            if (key === ' ' || key === 'spacebar') {
                event.preventDefault();
                togglePostSpeechPause();
                return;
            }

            if (key === 'u') {
                event.preventDefault();
                saveSelectedPost();
                return;
            }

            if (key === 'delete') {
                event.preventDefault();
                deleteSelectedPost();
            }
        }, true);

        if (fileToggle) {
            fileToggle.addEventListener('click', async function () {
                if (!isFilePersistenceSupported()) {
                    alert('当前浏览器不支持本地 JSON 文件同步。');
                    return;
                }

                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: `学习社区-${getUsername()}.json`,
                        types: [
                            {
                                description: 'JSON',
                                accept: { 'application/json': ['.json'] },
                            },
                        ],
                    });
                    const normalized = ensureSeeded(loadFromLocalStorage());
                    await setFileHandle(handle);
                    await writeStateToFile(handle, normalized);
                    await updateHint();
                    speakFeedback('已连接本地 JSON 文件同步。');
                } catch (error) {
                    // User cancelled the picker.
                }
            });
        }

        await updateHint();
        await refresh();
        setTimeout(function () {
            if (keyboardAnnouncementPlayed) {
                return;
            }
            keyboardAnnouncementPlayed = true;
            speakFeedback('当前是学习社区页面。按斜杠聚焦搜索。按上下方向键切换帖子。按回车展开或收起当前帖子。按 L 朗读当前帖子。按空格暂停或继续朗读。按 U 保存当前帖子到我的笔记。按 Delete 删除当前帖子。按 Esc 回到搜索框。');
        }, 420);
    }

    window.LocalCommunity = {
        loadState: loadState,
        saveState: saveState,
        addPostFromSummary: addPostFromSummary,
        moderateContent: moderateContent,
    };

    document.addEventListener('DOMContentLoaded', function () {
        initCommunityPage();
    });
})();
