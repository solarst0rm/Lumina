// ============== AI 语音助手 ==============
(function() {
  'use strict';

  // ===== 状态变量 =====
  var conversationHistory = [];
  var isRecording = false;
  var recognition = null;
  var isSending = false;

  // DOM 元素引用（延迟获取）
  var overlay, aiWindow, messagesEl, textInput, micBtn, sendBtn, closeBtn, spriteBtn;
  function canUseAIAssistant() {
    return !!window._aiAssistantPageEnabled && !window._tutorialActive && !window._helpOverlayOpen;
  }

  function syncSpriteState() {
    if (!spriteBtn) return;

    var disabled = !canUseAIAssistant();
    var disabledReason = !window._aiAssistantPageEnabled
      ? 'AI\u8bed\u97f3\u52a9\u624b\u4ec5\u53ef\u5728\u201c\u4e0a\u4f20\u8d44\u6599\u201d\u9875\u9762\u4f7f\u7528'
      : '\u8bf7\u5148\u5173\u95ed\u4f7f\u7528\u5e2e\u52a9\u6216\u65b0\u624b\u6559\u7a0b\uff0c\u518d\u4f7f\u7528AI\u8bed\u97f3\u52a9\u624b';

    spriteBtn.classList.toggle('is-disabled', disabled);
    spriteBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    spriteBtn.title = disabled ? disabledReason : 'AI\u8bed\u97f3\u52a9\u624b\uff08\u957f\u6309\u7a7a\u683c\u4e5f\u53ef\u6253\u5f00\uff09';
  }

  window.refreshAIAssistantAvailability = function() {
    syncSpriteState();
    if (!canUseAIAssistant() && window._aiWindowOpen && typeof window.closeAIAssistant === 'function') {
      window.closeAIAssistant();
    }
  };


  // ===== 鍒濆鍖?=====
  function init() {
    overlay = document.getElementById('ai-overlay');
    aiWindow = document.getElementById('ai-window');
    messagesEl = document.getElementById('ai-messages');
    textInput = document.getElementById('ai-text-input');
    micBtn = document.getElementById('ai-mic-btn');
    sendBtn = document.getElementById('ai-send-btn');
    closeBtn = document.getElementById('ai-close-btn');
    spriteBtn = document.getElementById('ai-sprite-btn');

    if (!overlay || !spriteBtn) return;
    syncSpriteState();

    // 绮剧伒鍥炬爣鐐瑰嚮
    spriteBtn.addEventListener('click', function(e) {
      if (!canUseAIAssistant()) {
        e.preventDefault();
        return;
      }
      window.openAIAssistant();
    });

    // 鍏抽棴鎸夐挳
    closeBtn.addEventListener('click', function() {
      window.closeAIAssistant();
    });

    // 閬僵灞傜偣鍑伙紙鍙湪鐐瑰嚮閬僵鏈韩鏃跺叧闂紝涓嶅湪鐐瑰嚮绐楀彛鍐呭鏃跺叧闂級
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        window.closeAIAssistant();
      }
    });

    // 鍙戦€佹寜閽?
    sendBtn.addEventListener('click', function() {
      sendMessage();
    });

    // 楹﹀厠椋庢寜閽?
    micBtn.addEventListener('click', function() {
      toggleVoiceInput();
    });

    // 杈撳叆妗嗗洖杞﹀彂閫?
    textInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // 蹇嵎閿細Ctrl+Space 鍞ら啋 AI 鎴栧綍闊筹紱闀挎寜绌烘牸鐩存帴璇煶杈撳叆锛堝厛鍙啀褰曢煶锛?
    var spacePressTimer = null;
    var spacePressed = false;
    var ctrlSpaceTimer = null;
    var ctrlSpacePressed = false;

    document.addEventListener('keydown', function(e) {
      if (window._disableGlobalAIAssistantHotkeys || !canUseAIAssistant()) {
        return;
      }
      if (e.code === 'Space') {
        // Ctrl+Space锛氭墦寮€绐楀彛鎴栧綍闊?
        if (e.ctrlKey) {
          e.preventDefault();
          if (!ctrlSpacePressed) {
            ctrlSpacePressed = true;
            ctrlSpaceTimer = setTimeout(function() {
              if (!canUseAIAssistant()) return;
              if (!window._aiWindowOpen) {
                window.openAIAssistant(false);
                if (textInput) textInput.disabled = true;
                isLongPressRecording = true;
                setTimeout(function() { toggleVoiceInput(); }, 100);
              } else if (!isRecording) {
                // 鍔╂墜宸叉墦寮€锛岄暱鎸?Ctrl+Space 寮€濮嬪綍闊筹紝绂佺敤鏂囧瓧杈撳叆
                if (textInput) textInput.disabled = true;
                isLongPressRecording = true;
                toggleVoiceInput();
              }
            }, 400);
          }
          return;
        }

        // 閬垮厤鍦ㄨ緭鍏ユ鍐呭奖鍝嶈緭鍏?
        var target = e.target;
        var isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (isInput) return;

        if (!spacePressed) {
          spacePressed = true;
          spacePressTimer = setTimeout(function() {
            if (!canUseAIAssistant()) return;
            // 闀挎寜绌烘牸锛氭墦寮€AI绐楀彛浣嗕笉璇煶鎻愮ず锛岀珛鍗冲紑濮嬪綍闊筹紝绂佺敤鏂囧瓧杈撳叆
            window.openAIAssistant(false);
            if (textInput) textInput.disabled = true;
            isLongPressRecording = true;
            setTimeout(function() {
              toggleVoiceInput();
            }, 100);
          }, 400);
        }

        e.preventDefault();
      }
    }, true); // 鎹曡幏闃舵锛岀‘淇濆湪杈撳叆妗嗚幏寰楃劍鐐规椂涔熻兘鎷︽埅

    document.addEventListener('keyup', function(e) {
      if (window._disableGlobalAIAssistantHotkeys || !canUseAIAssistant()) {
        return;
      }
      if (e.code === 'Space') {
        // 鏃犺 Ctrl 鏄惁杩樻寜鐫€锛屾澗寮€ Space 鏃跺仠姝㈤暱鎸夊綍闊?
        if (isRecording && isLongPressRecording) {
          if (recognition) recognition.stop();
        }

        if (ctrlSpacePressed) {
          ctrlSpacePressed = false;
          if (ctrlSpaceTimer) {
            // 鐭寜 Ctrl+Space锛屾墦寮€鍔╂墜
            clearTimeout(ctrlSpaceTimer);
            ctrlSpaceTimer = null;
            if (!window._aiWindowOpen) {
              window.openAIAssistant(true);
            }
          }
        } else {
          spacePressed = false;
          if (spacePressTimer) {
            clearTimeout(spacePressTimer);
            spacePressTimer = null;
          }
        }
      }
    }, true); // 鎹曡幏闃舵
  }

  // ===== 绐楀彛鎺у埗 =====
  window.openAIAssistant = function(shouldSpeak) {
    if (!overlay || !canUseAIAssistant()) return false;
    window._aiWindowOpen = true;
    overlay.classList.add('active');

    // 取消当前 TTS
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // 聚焦输入框
    setTimeout(function() {
      if (textInput) textInput.focus();
    }, 100);

    // 语音提示
    if (shouldSpeak !== false) {
      speak('AI助手已打开，请输入你的问题');
    }
    return true;
  };

  window.closeAIAssistant = function() {
    if (!overlay) return;
    window._aiWindowOpen = false;
    overlay.classList.remove('active');

    // 清空对话历史
    conversationHistory = [];

    // 清空消息区域，恢复欢迎信息
    if (messagesEl) {
      messagesEl.innerHTML =
        '<div class="ai-welcome">' +
          '<p>\u4f60\u597d\uff01\u6211\u662f\u4f60\u7684AI\u5b66\u4e60\u52a9\u624b\u3002</p>' +
          '<p>\u8f93\u5165\u95ee\u9898\u6216\u70b9\u51fb\u9ea6\u514b\u98ce\u8bed\u97f3\u63d0\u95ee\uff0c\u6211\u4f1a\u7528\u8bed\u97f3\u56de\u7b54\u4f60\u3002</p>' +
          '<p style="font-size:0.8rem;margin-top:8px;color:var(--text-secondary);">\u6309 Esc \u5173\u95ed\u7a97\u53e3</p>' +
        '</div>';
    }

    // 清空输入框
    if (textInput) {
      textInput.value = '';
      textInput.disabled = false;
    }

    // 停止语音识别
    if (isRecording && recognition) {
      recognition.abort();
      isRecording = false;
      isLongPressRecording = false;
      if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.setAttribute('aria-pressed', 'false');
      }
    }

    // 取消 TTS
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // 恢复发送按钮
    isSending = false;
    if (sendBtn) sendBtn.disabled = false;
  };

  // ===== 消息处理 =====
  function appendMessage(role, text) {
    if (!messagesEl) return;

    // 移除欢迎信息
    var welcome = messagesEl.querySelector('.ai-welcome');
    if (welcome) welcome.remove();

    var div = document.createElement('div');
    div.className = 'ai-msg';

    if (role === 'user') {
      div.classList.add('ai-msg-user');
    } else if (role === 'bot') {
      div.classList.add('ai-msg-bot');
    } else if (role === 'error') {
      div.classList.add('ai-msg-error');
    }

    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function showLoading() {
    if (!messagesEl) return null;
    var div = document.createElement('div');
    div.className = 'ai-msg ai-msg-loading';
    div.id = 'ai-loading-msg';
    div.innerHTML = 'AI思考中<span class="ai-loading-dots"></span>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function removeLoading() {
    var el = document.getElementById('ai-loading-msg');
    if (el) el.remove();
  }

  function sendMessage() {
    if (!textInput || isSending) return;

    var text = textInput.value.trim();
    if (!text) return;

    // 显示用户消息
    appendMessage('user', text);
    textInput.value = '';

    // 加入历史
    conversationHistory.push({ role: 'user', content: text });

    // 禁用发送按钮
    isSending = true;
    if (sendBtn) sendBtn.disabled = true;

    // 显示加载
    showLoading();

    // 发送请求（30秒超时）
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 30000);

    fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: conversationHistory.slice(0, -1), // 最后一条是刚加的user消息，后端会自己拼
        doc_summary: window._sumText || '',
        doc_exercise: window._exText || '',
        uploaded_file: window._uploadedFileName || ''
      }),
      signal: controller.signal
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      clearTimeout(timeoutId);
      removeLoading();

      if (data.success && data.reply) {
        appendMessage('bot', data.reply);
        conversationHistory.push({ role: 'assistant', content: data.reply });
        speakAIResponse(data.reply);
      } else {
        var errMsg = data.error || '请求失败，请重试';
        appendMessage('error', errMsg);
      }
    })
    .catch(function(err) {
      clearTimeout(timeoutId);
      removeLoading();
      var msg = err.name === 'AbortError' ? '请求超时，请重试' : '网络错误，请重试';
      appendMessage('error', msg);
      speak(msg);
    })
    .finally(function() {
      isSending = false;
      if (sendBtn) sendBtn.disabled = false;
      if (textInput) textInput.focus();
    });
  }

  // ===== TTS 朗读 AI 回复 =====
  function speakAIResponse(text) {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = window._rate || 1.0;
    window.speechSynthesis.speak(u);
  }

  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = window._rate || 1.0;
    window.speechSynthesis.speak(u);
  }

  // ===== 叮声提示（Web Audio API）=====
  function playDing(callback) {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) { if (callback) callback(); return; }
      var ctx = new AudioCtx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 音
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      osc.onended = function() {
        ctx.close();
        if (callback) callback();
      };
    } catch (e) {
      if (callback) callback();
    }
  }

  // ===== 语音输入 =====
  function toggleVoiceInput() {
    if (isRecording) {
      // 停止录音
      if (recognition) recognition.stop();
      isRecording = false;
      if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.setAttribute('aria-pressed', 'false');
      }
      return;
    }

    // 检查浏览器支持
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      speak('您的浏览器不支持语音输入功能，请使用文本输入');
      appendMessage('error', '浏览器不支持语音输入，请使用Chrome浏览器');
      return;
    }

    // 创建识别实例
    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = function(event) {
        var transcript = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (textInput) textInput.value = transcript;

        // 如果是最终结果，自动发送
        if (event.results[event.results.length - 1].isFinal && !isLongPressRecording) {
          setTimeout(function() {
            sendMessage();
          }, 300);
        }
      };

      recognition.onerror = function(event) {
        isRecording = false;
        isLongPressRecording = false;
        if (micBtn) {
          micBtn.classList.remove('recording');
          micBtn.setAttribute('aria-pressed', 'false');
        }
        if (textInput) textInput.disabled = false;
        if (event.error !== 'aborted') {
          speak('语音识别出错，请重试');
        }
      };

      recognition.onend = function() {
        isRecording = false;
        if (micBtn) {
          micBtn.classList.remove('recording');
          micBtn.setAttribute('aria-pressed', 'false');
        }
        if (textInput) textInput.disabled = false;
        // 如果是长按录音，结束后发送消息
        if (isLongPressRecording) {
          isLongPressRecording = false;
          setTimeout(function() {
            sendMessage();
          }, 300);
        }
      };
    }

    // 开始录音：先播放叮声，再启动识别
    try {
      if (micBtn) {
        micBtn.classList.add('recording');
        micBtn.setAttribute('aria-pressed', 'true');
      }
      isRecording = true;
      // 取消TTS避免录到语音
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      playDing(function() {
        // 叮声播完后再启动语音识别
        try {
          recognition.start();
        } catch (err) {
          isRecording = false;
          if (micBtn) {
            micBtn.classList.remove('recording');
            micBtn.setAttribute('aria-pressed', 'false');
          }
          speak('语音识别启动失败，请重试');
        }
      });
    } catch (e) {
      isRecording = false;
      if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.setAttribute('aria-pressed', 'false');
      }
      speak('语音识别启动失败，请重试');
    }
  }

  // ===== 页面加载初始化 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();