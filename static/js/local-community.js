/* 本地版学习社区：纯前端、无网络、无后端 */
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
            title: '欢迎来到学习社区',
            content:
                '你可以在 AI 总结结果页点击“上传到学习社区”，把当前总结保存为一条帖子，然后在这里搜索和查看。\n\n建议：给总结起一个清晰的标题，后续检索会更方便。',
            createdAt: '2026-03-01T10:00:00.000Z',
            updatedAt: '2026-03-01T10:00:00.000Z',
            source: 'seed',
            author: '社区公告',
        },
        {
            id: 'seed-2',
            title: '如何高效复习：先总结，再闯关',
            content:
                '建议流程：\n1) 先通读“文档总结”，抓住标题与关键概念\n2) 再进入“答题闯关”检验掌握程度\n3) 错题回到总结定位知识点\n\n你也可以把自己的总结上传到学习社区，形成可搜索的复习库。',
            createdAt: '2026-03-02T12:00:00.000Z',
            updatedAt: '2026-03-02T12:00:00.000Z',
            source: 'seed',
            author: '新手引导',
        },
        {
            id: 'seed-3',
            title: '搜索技巧：用关键词快速定位',
            content:
                '在搜索框输入关键词（例如“公式”“步骤”“定义”），即可在本地帖子标题/内容中检索。\n\n提示：不区分大小写，支持连续输入实时过滤。',
            createdAt: '2026-03-03T09:30:00.000Z',
            updatedAt: '2026-03-03T09:30:00.000Z',
            source: 'seed',
            author: '新手引导',
        },
    ];

    const MODERATION_KEYWORDS = [
        '色情',
        '黄色',
        '赌博',
        '毒品',
        '诈骗',
        '暴力',
        '枪支',
        '恐怖',
    ];

    const MODERATION_PATTERNS = [
        { name: '联系方式（邮箱）', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
        { name: '联系方式（手机号）', re: /\b1[3-9]\d{9}\b/g },
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

    function safeJsonParse(text) {
        if (!text) {
            return null;
        }
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function normalizeState(state) {
        if (!state || typeof state !== 'object') {
            return { ...DEFAULT_STATE };
        }
        const posts = Array.isArray(state.posts) ? state.posts : [];
        return {
            version: COMMUNITY_VERSION,
            updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : '',
            posts: posts
                .filter((p) => p && typeof p === 'object')
                .map((p) => ({
                    id: String(p.id || ''),
                    title: String(p.title || ''),
                    content: String(p.content || ''),
                    createdAt: String(p.createdAt || ''),
                    updatedAt: String(p.updatedAt || ''),
                    source: String(p.source || 'local'),
                    author: String(p.author || getUsername()),
                }))
                .filter((p) => p.id && p.title),
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
        return await new Promise((resolve) => {
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
        return await new Promise((resolve) => {
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
        return await new Promise((resolve) => {
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
        const key = `fileHandle:${getStorageKey()}`;
        return await idbGet(key);
    }

    async function setFileHandle(handle) {
        const key = `fileHandle:${getStorageKey()}`;
        return await idbSet(key, handle);
    }

    async function readStateFromFile(handle) {
        try {
            const file = await handle.getFile();
            const text = await file.text();
            const parsed = safeJsonParse(text);
            return normalizeState(parsed || DEFAULT_STATE);
        } catch (e) {
            return null;
        }
    }

    async function writeStateToFile(handle, state) {
        try {
            const writable = await handle.createWritable();
            await writable.write(JSON.stringify(state, null, 2));
            await writable.close();
            return true;
        } catch (e) {
            return false;
        }
    }

    function ensureSeeded(state) {
        if (state.posts && state.posts.length) {
            return state;
        }
        const seeded = normalizeState({
            version: COMMUNITY_VERSION,
            updatedAt: nowIso(),
            posts: SEED_POSTS,
        });
        return seeded;
    }

    async function loadState() {
        let state = loadFromLocalStorage();

        // 如果已启用“本地文件持久化”，则优先读取文件，并回写 localStorage
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
        state.updatedAt = nowIso();
        saveToLocalStorage(state);
        if (isFilePersistenceSupported()) {
            const handle = await getFileHandle();
            if (handle) {
                await writeStateToFile(handle, state);
            }
        }
        return state;
    }

    function moderateContent(text) {
        const content = (text || '').toString();
        if (!content.trim()) {
            return { ok: false, reason: '内容为空，无法上传。' };
        }

        if (content.length > 50000) {
            return { ok: false, reason: '内容过长（超过 50,000 字符），请精简后再上传。' };
        }

        const lowered = content.toLowerCase();
        for (const word of MODERATION_KEYWORDS) {
            if (word && lowered.includes(word.toLowerCase())) {
                return { ok: false, reason: `内容审核未通过：包含敏感词「${word}」。` };
            }
        }

        for (const rule of MODERATION_PATTERNS) {
            rule.re.lastIndex = 0;
            if (rule.re.test(content)) {
                return { ok: false, reason: `内容审核未通过：包含${rule.name}。` };
            }
        }

        return { ok: true, reason: '' };
    }

    function extractTitleFromMarkdown(markdownText) {
        const text = (markdownText || '').toString();
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }
            const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
            if (headingMatch) {
                return headingMatch[1].trim();
            }
            // 第一行非空也可作为标题
            return trimmed.replace(/\s+/g, ' ');
        }
        return '学习总结';
    }

    function clip(text, maxLen) {
        const s = (text || '').toString().trim();
        if (s.length <= maxLen) {
            return s;
        }
        return s.slice(0, Math.max(0, maxLen - 1)) + '…';
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

        const title = clip(extractTitleFromMarkdown(summaryText), 48) || '学习总结';
        const post = {
            id: makeId(),
            title,
            content: summaryText.toString(),
            createdAt: nowIso(),
            updatedAt: nowIso(),
            source: 'ai-summary',
            author: getUsername(),
        };

        const state = await loadState();
        state.posts = [post, ...(state.posts || [])];
        await saveState(state);
        return { success: true, post };
    }

    function searchPosts(state, keyword) {
        const q = (keyword || '').toString().trim().toLowerCase();
        const posts = Array.isArray(state.posts) ? state.posts : [];
        if (!q) {
            return posts;
        }
        return posts.filter((p) => {
            const t = (p.title || '').toString().toLowerCase();
            const c = (p.content || '').toString().toLowerCase();
            return t.includes(q) || c.includes(q);
        });
    }

    function formatDate(iso) {
        if (!iso) {
            return '';
        }
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
            return iso;
        }
        return d.toLocaleString();
    }

    function sourceLabel(source) {
        const s = (source || '').toString();
        if (s === 'ai-summary') {
            return 'AI总结';
        }
        if (s === 'seed') {
            return '社区推荐';
        }
        return '社区内容';
    }

    function escapeHtml(text) {
        return (text || '')
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderPostItem(post, highlightId) {
        const createdLabel = formatDate(post.createdAt);
        const snippet = clip(post.content || '', 160);
        const isHighlight = highlightId && post.id === highlightId;
        const borderStyle = isHighlight ? 'border-left: 4px solid var(--success-color);' : '';

        const contentId = `post-content-${escapeHtml(post.id)}`;
        const btnId = `post-toggle-${escapeHtml(post.id)}`;

        return `
            <div class="card community-post" id="post-${escapeHtml(post.id)}" style="${borderStyle}">
                <div class="community-post-title">
                    <h3><i class="fas fa-comment-dots"></i> ${escapeHtml(post.title || '')}</h3>
                    <span class="community-meta">作者：${escapeHtml(post.author || '')}</span>
                    <span class="community-meta">时间：${escapeHtml(createdLabel)}</span>
                </div>
                <div class="community-post-snippet" id="${contentId}" data-full="0">${escapeHtml(snippet)}</div>
                <div class="community-post-actions">
                    <button type="button" class="btn btn-secondary" id="${btnId}" data-post-id="${escapeHtml(
            post.id
        )}">
                        <i class="fas fa-eye"></i> 查看全文
                    </button>
                    <span class="community-meta">来源：${escapeHtml(sourceLabel(post.source))}</span>
                </div>
            </div>
        `;
    }

    function getHighlightId() {
        try {
            const url = new URL(window.location.href);
            return url.searchParams.get('highlight') || '';
        } catch (e) {
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

        if (fileToggle && isFilePersistenceSupported()) {
            fileToggle.style.display = '';
        }

        let state = await loadState();

        let currentPostsById = new Map();

        listNode.addEventListener('click', function (e) {
            const target = e.target && e.target.closest ? e.target.closest('button[data-post-id]') : null;
            if (!target) {
                return;
            }
            const postId = target.getAttribute('data-post-id');
            const post = currentPostsById.get(postId);
            if (!post) {
                return;
            }

            const contentNode = document.getElementById(`post-content-${postId}`);
            if (!contentNode) {
                return;
            }

            const isFull = contentNode.getAttribute('data-full') === '1';
            if (isFull) {
                contentNode.textContent = clip(post.content || '', 160);
                contentNode.setAttribute('data-full', '0');
                target.innerHTML = '<i class="fas fa-eye"></i> 查看全文';
            } else {
                contentNode.textContent = (post.content || '').toString();
                contentNode.setAttribute('data-full', '1');
                target.innerHTML = '<i class="fas fa-eye-slash"></i> 收起';
            }
        });

        async function refresh() {
            state = await loadState();
            const posts = searchPosts(state, searchInput.value || '');
            if (!posts.length) {
                listNode.innerHTML = '<div class="card community-empty">暂无匹配的帖子</div>';
                return;
            }

            const postsById = new Map();
            for (const p of posts) {
                postsById.set(p.id, p);
            }
            currentPostsById = postsById;

            listNode.innerHTML = posts.map((p) => renderPostItem(p, highlightId)).join('');

            if (highlightId) {
                const el = document.getElementById(`post-${highlightId}`);
                if (el && typeof el.scrollIntoView === 'function') {
                    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }
            }
        }

        function setHint(text) {
            if (!hintNode) {
                return;
            }
            hintNode.textContent = text || '';
        }

        async function updateHint() {
            if (isFilePersistenceSupported()) {
                const handle = await getFileHandle();
                setHint(handle ? '保存方式：已开启备份同步' : '保存方式：自动保存');
            } else {
                setHint('保存方式：自动保存');
            }
        }

        searchInput.addEventListener('input', function () {
            refresh();
        });

        if (fileToggle) {
            fileToggle.addEventListener('click', async function () {
                if (!isFilePersistenceSupported()) {
                    alert('当前环境不支持本地文件持久化。');
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
                    alert('已开启备份同步（后续发帖会同步写入该文件）。');
                } catch (e) {
                    // 用户取消选择
                }
            });
        }

        await updateHint();
        await refresh();
    }

    function wireResultUploadButton() {
        const btn = document.getElementById('btn-upload-to-community');
        if (!btn) {
            return;
        }

        btn.addEventListener('click', async function () {
            const summary = typeof window._sumText === 'string' ? window._sumText : '';
            const result = await addPostFromSummary(summary);
            if (!result.success) {
                alert(result.error || '上传失败');
                return;
            }

            const url = typeof window._learningCommunityUrl === 'string' ? window._learningCommunityUrl : '/community';
            const highlight = result.post && result.post.id ? result.post.id : '';
            window.location.href = highlight ? `${url}?highlight=${encodeURIComponent(highlight)}` : url;
        });
    }

    window.LocalCommunity = {
        loadState,
        addPostFromSummary,
        moderateContent,
    };

    document.addEventListener('DOMContentLoaded', function () {
        initCommunityPage();
        wireResultUploadButton();
    });
})();
