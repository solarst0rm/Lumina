(function () {
    'use strict';

    const COMMUNITY_VERSION = 1;

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

    function normalizeState(state) {
        const raw = state && typeof state === 'object' ? state : {};
        const posts = Array.isArray(raw.posts) ? raw.posts : [];
        return {
            version: COMMUNITY_VERSION,
            updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
            posts: posts.filter(function (post) {
                return post && typeof post === 'object' && post.id && post.title;
            }),
        };
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

    async function getFileHandle() {
        return await idbGet(getFileHandleKey());
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

    async function loadState() {
        if (window.LocalCommunity && typeof window.LocalCommunity.loadState === 'function') {
            try {
                return normalizeState(await window.LocalCommunity.loadState());
            } catch (error) {}
        }
        const raw = window.localStorage ? window.localStorage.getItem(getStorageKey()) : '';
        return normalizeState(safeJsonParse(raw));
    }

    async function saveState(state) {
        const normalized = normalizeState(state);
        normalized.updatedAt = nowIso();
        if (window.localStorage) {
            window.localStorage.setItem(getStorageKey(), JSON.stringify(normalized));
        }
        const handle = await getFileHandle();
        if (handle) {
            await writeStateToFile(handle, normalized);
        }
        return normalized;
    }

    function speak(text) {
        if (!window.speechSynthesis || !text) {
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = typeof window._rate === 'number' ? window._rate : 1;
        window.speechSynthesis.speak(utterance);
    }

    function stripExtension(filename) {
        return (filename || '').toString().trim().replace(/\.[^.\\/]+$/, '');
    }

    function extractTitle(summaryText, uploadedFilename) {
        const preferred = stripExtension(uploadedFilename);
        if (preferred) {
            return preferred;
        }
        const text = (summaryText || '').toString();
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
            const trimmed = lines[i].trim();
            if (!trimmed) {
                continue;
            }
            const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
            return heading ? heading[1].trim() : trimmed.replace(/\s+/g, ' ');
        }
        return '学习资料';
    }

    function buildStudyPackContent(summaryText, exerciseText, uploadedFilename) {
        const blocks = [];
        const title = stripExtension(uploadedFilename);
        if (title) {
            blocks.push(`# ${title}`);
        }
        if ((summaryText || '').toString().trim()) {
            blocks.push('## 文档总结');
            blocks.push((summaryText || '').toString().trim());
        }
        if ((exerciseText || '').toString().trim()) {
            blocks.push('## 习题内容');
            blocks.push((exerciseText || '').toString().trim());
        }
        return blocks.join('\n\n').trim();
    }

    function makeId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return `study-pack-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function setStatus(text, isError) {
        const node = document.getElementById('community-upload-status');
        if (!node) {
            return;
        }
        node.style.display = text ? 'block' : 'none';
        node.textContent = text || '';
        node.style.background = isError ? 'rgba(229, 62, 62, 0.1)' : 'rgba(56, 161, 105, 0.1)';
        node.style.borderColor = isError ? 'rgba(229, 62, 62, 0.2)' : 'rgba(56, 161, 105, 0.2)';
    }

    async function uploadCurrentStudyPack() {
        const summaryText = typeof window._sumText === 'string' ? window._sumText : '';
        const exerciseText = typeof window._exText === 'string' ? window._exText : '';
        const uploadedFilename = typeof window._uploadedFileName === 'string' ? window._uploadedFileName : '';
        const content = buildStudyPackContent(summaryText, exerciseText, uploadedFilename);

        if (!summaryText.trim() || !exerciseText.trim()) {
            const message = '请先完成总结和习题，再上传到学习社区。';
            setStatus(message, true);
            speak(message);
            return { success: false, error: message };
        }

        if (window.LocalCommunity && typeof window.LocalCommunity.moderateContent === 'function') {
            const moderation = window.LocalCommunity.moderateContent(content);
            if (!moderation.ok) {
                setStatus(moderation.reason, true);
                speak(moderation.reason);
                return { success: false, error: moderation.reason };
            }
        }

        const post = {
            id: makeId(),
            title: extractTitle(summaryText, uploadedFilename).slice(0, 48),
            content,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            source: 'study-pack',
            author: getUsername(),
        };

        const state = await loadState();
        state.posts = [post].concat(Array.isArray(state.posts) ? state.posts : []);
        await saveState(state);

        setStatus('上传成功，已保存到学习社区。', false);
        speak('上传成功，已保存到学习社区。');
        return { success: true, post: post };
    }

    function bindStudyPackUpload() {
        const button = document.getElementById('btn-upload-to-community');
        if (!button || window._communityUploadMode !== 'study-pack') {
            return;
        }

        button.addEventListener('click', async function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (button.disabled) {
                return;
            }
            button.disabled = true;
            setStatus('正在上传到学习社区……', false);
            const result = await uploadCurrentStudyPack();
            if (!result.success) {
                button.disabled = false;
                return;
            }
            button.innerHTML = '<i class="fas fa-check"></i> 已上传到学习社区';
        }, true);
    }

    document.addEventListener('DOMContentLoaded', bindStudyPackUpload);
})();
